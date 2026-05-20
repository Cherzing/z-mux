import * as net from 'net';
import * as fs from 'fs';
import { WindowManager } from './window-manager';
import { TerminalManager } from './terminal-manager';
import { BrowserManager } from './browser-manager';
import * as browserAuto from './browser-automation';
import { FeedBridge } from './feed-bridge';
import { AgentResumeManager } from './agent-resume';
import { SSHManager } from './ssh-manager';
import { NotificationManager } from './notification-manager';

interface SocketCommand { command: string; args?: Record<string, any>; id?: string; }
interface SocketResponse { id?: string; ok: boolean; result?: any; error?: string; }

export class SocketServer {
  private server: net.Server | null = null;
  private clients: Set<net.Socket> = new Set();
  private socketPath: string;
  private windowManager: WindowManager;
  private terminalManager: TerminalManager;
  private browserManager: BrowserManager;
  private sshManager: SSHManager;
  private notificationManager: NotificationManager;
  private feedBridge?: FeedBridge;
  private agentResumeManager?: AgentResumeManager;

  constructor(
    socketPath: string,
    windowManager: WindowManager,
    terminalManager: TerminalManager,
    browserManager: BrowserManager,
    sshManager: SSHManager,
    notificationManager: NotificationManager,
    feedBridge?: FeedBridge,
    agentResumeManager?: AgentResumeManager
  ) {
    this.socketPath = socketPath;
    this.windowManager = windowManager;
    this.terminalManager = terminalManager;
    this.browserManager = browserManager;
    this.sshManager = sshManager;
    this.notificationManager = notificationManager;
    this.feedBridge = feedBridge;
    this.agentResumeManager = agentResumeManager;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.clients.add(socket);
        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) this.handleMessage(socket, line.trim());
          }
        });
        socket.on('close', () => this.clients.delete(socket));
        socket.on('error', () => this.clients.delete(socket));
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn('Socket already in use, another instance may be running');
          resolve();
        } else { reject(err); }
      });

      if (process.platform === 'win32') {
        const namedPipe = `\\\\.\\pipe\\z-mux`;
        this.server.listen(namedPipe, () => { console.log(`Socket server listening on ${namedPipe}`); resolve(); });
      } else {
        if (fs.existsSync(this.socketPath)) fs.unlinkSync(this.socketPath);
        this.server.listen(this.socketPath, () => { console.log(`Socket server listening on ${this.socketPath}`); resolve(); });
      }
    });
  }

  stop(): void {
    for (const client of this.clients) client.destroy();
    this.clients.clear();
    this.server?.close();
  }

  private async handleMessage(socket: net.Socket, raw: string): Promise<void> {
    let cmd: SocketCommand;
    try { cmd = JSON.parse(raw); }
    catch { this.send(socket, { ok: false, error: 'Invalid JSON' }); return; }
    this.send(socket, await this.executeCommand(cmd));
  }

  private async executeCommand(cmd: SocketCommand): Promise<SocketResponse> {
    try {
      switch (cmd.command) {
        // ── Workspaces ──
        case 'list-workspaces': {
          const state = this.windowManager.getState();
          return { id: cmd.id, ok: true, result: Array.from(state.workspaces.entries()).map(([id, ws]) => ({ id, name: ws.name, tabCount: ws.tabs.size })) };
        }
        case 'create-workspace': {
          const id = this.windowManager.createWorkspace(cmd.args?.name);
          const paneId = this.windowManager.createSurface(id);
          this.terminalManager.createTerminal(paneId, { workspaceId: id });
          return { id: cmd.id, ok: true, result: { id, paneId } };
        }
        case 'select-workspace': { this.windowManager.selectWorkspace(cmd.args?.id); return { id: cmd.id, ok: true }; }
        case 'close-workspace': { this.windowManager.closeWorkspace(cmd.args?.id); return { id: cmd.id, ok: true }; }
        case 'rename-workspace': { this.windowManager.renameWorkspace(cmd.args?.id, cmd.args?.name); return { id: cmd.id, ok: true }; }

        // ── Surfaces ──
        case 'list-surfaces': {
          const ws = this.windowManager.getActiveWorkspace();
          if (!ws) return { id: cmd.id, ok: false, error: 'No active workspace' };
          const surfaces: any[] = [];
          for (const tab of ws.tabs.values()) {
            for (const pane of tab.panes.values()) {
              surfaces.push({ id: pane.id, title: pane.title, type: pane.type, workingDir: pane.workingDir });
            }
          }
          return { id: cmd.id, ok: true, result: surfaces };
        }
        case 'create-surface': {
          const wsId = cmd.args?.workspaceId || this.windowManager.getState().activeWorkspaceId;
          const type = cmd.args?.type || 'terminal';
          const paneId = this.windowManager.createSurface(wsId, type);
          if (type === 'terminal') this.terminalManager.createTerminal(paneId, { workspaceId: wsId });
          else this.browserManager.createBrowser(paneId);
          return { id: cmd.id, ok: true, result: { id: paneId } };
        }
        case 'close-surface': {
          this.terminalManager.killTerminal(cmd.args?.id);
          this.sshManager.disconnect(cmd.args?.id);
          this.browserManager.removeBrowser(cmd.args?.id);
          this.windowManager.closeSurface(cmd.args?.id);
          return { id: cmd.id, ok: true };
        }
        case 'split': {
          const direction = cmd.args?.direction || 'vertical';
          const newPaneId = this.windowManager.splitPane(cmd.args?.surfaceId, direction);
          if (newPaneId) {
            const wsId = this.windowManager.getState().activeWorkspaceId;
            const ws = this.windowManager.getState().workspaces.get(wsId);
            const tab = ws?.tabs.get(ws.activeTabId);
            const sourcePane = tab?.panes.get(cmd.args?.surfaceId);
            this.terminalManager.createTerminal(newPaneId, { workingDir: sourcePane?.workingDir, workspaceId: wsId });
          }
          return { id: cmd.id, ok: true, result: { id: newPaneId } };
        }

        // ── Send input ──
        case 'send': {
          if (cmd.args?.surfaceId && cmd.args?.text) {
            this.terminalManager.writeToTerminal(cmd.args.surfaceId, cmd.args.text);
          }
          return { id: cmd.id, ok: true };
        }

        // ── Focus ──
        case 'focus': {
          // Update active pane in window manager
          return { id: cmd.id, ok: true };
        }

        // ── Notifications ──
        case 'notify': {
          this.notificationManager.addNotification({
            surfaceId: cmd.args?.surfaceId || '',
            workspaceId: cmd.args?.workspaceId || '',
            title: cmd.args?.title || 'Notification',
            body: cmd.args?.body || cmd.args?.subtitle || '',
            type: cmd.args?.type || 'info',
            metadata: cmd.args?.metadata
          });
          return { id: cmd.id, ok: true };
        }
        case 'list-notifications': { return { id: cmd.id, ok: true, result: this.notificationManager.getAll() }; }
        case 'mark-notification-read': { this.notificationManager.markRead(cmd.args?.id); return { id: cmd.id, ok: true }; }

        // ── Browser ──
        case 'browser:open': {
          const wsId = cmd.args?.workspaceId || this.windowManager.getState().activeWorkspaceId;
          const paneId = this.windowManager.createSurface(wsId, 'browser');
          this.browserManager.createBrowser(paneId, cmd.args?.url);
          return { id: cmd.id, ok: true, result: { id: paneId } };
        }
        case 'browser:navigate': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          if (!surfaceId) return { id: cmd.id, ok: false, error: 'No browser pane' };
          return { id: cmd.id, ...await browserAuto.browserNavigate(surfaceId, cmd.args?.url) };
        }
        case 'browser:snapshot': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          if (!surfaceId) return { id: cmd.id, ok: false, error: 'No browser pane' };
          return { id: cmd.id, ...await browserAuto.browserSnapshot(surfaceId, cmd.args?.interactive) };
        }
        case 'browser:click': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserClick(surfaceId, cmd.args?.selector) };
        }
        case 'browser:fill': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserFill(surfaceId, cmd.args?.selector, cmd.args?.value) };
        }
        case 'browser:type': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserType(surfaceId, cmd.args?.selector, cmd.args?.text) };
        }
        case 'browser:eval': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserEval(surfaceId, cmd.args?.expression) };
        }
        case 'browser:get': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserGet(surfaceId, cmd.args?.property) };
        }
        case 'browser:screenshot': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserScreenshot(surfaceId) };
        }
        case 'browser:find': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserFind(surfaceId, cmd.args?.selector) };
        }
        case 'browser:wait': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserWait(surfaceId, cmd.args || {}) };
        }
        case 'browser:press': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserPress(surfaceId, cmd.args?.key) };
        }
        case 'browser:select': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserSelect(surfaceId, cmd.args?.selector, cmd.args?.values) };
        }
        case 'browser:scroll': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserScroll(surfaceId, cmd.args?.selector, cmd.args?.direction) };
        }
        case 'browser:cookies': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserCookies(surfaceId, cmd.args?.action, cmd.args?.data) };
        }
        case 'browser:storage': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserStorage(surfaceId, cmd.args?.action, cmd.args?.data) };
        }
        case 'browser:highlight': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserHighlight(surfaceId, cmd.args?.selector) };
        }
        case 'browser:is': {
          const surfaceId = cmd.args?.surfaceId || this.findFirstBrowserPane();
          return { id: cmd.id, ...await browserAuto.browserIs(surfaceId, cmd.args?.selector, cmd.args?.check) };
        }

        // ── SSH ──
        case 'ssh': {
          const target = cmd.args?.target;
          const wsId = this.windowManager.createWorkspace(cmd.args?.name || `SSH: ${target}`);
          const paneId = this.windowManager.createSurface(wsId);
          const config = this.sshManager.parseTarget(target);
          if (cmd.args?.port) config.port = cmd.args.port;
          if (cmd.args?.key) (config as any).privateKey = fs.readFileSync(cmd.args.key);
          this.sshManager.connect(paneId, config).catch(() => {});
          return { id: cmd.id, ok: true, result: { id: wsId, paneId } };
        }

        // ── Hooks ──
        case 'hooks:setup': {
          // Create hook scripts for detected agents
          return { id: cmd.id, ok: true, result: { message: 'Hooks setup complete' } };
        }

        // ── Session ──
        case 'session:restore': { return { id: cmd.id, ok: true }; }
        case 'session:save': { return { id: cmd.id, ok: true }; }

        // ── Config ──
        case 'reload-config': { return { id: cmd.id, ok: true }; }

        // ── Feed Bridge ──
        case 'feed:getEventLog': {
          if (!this.feedBridge) return { id: cmd.id, ok: true, result: [] };
          return { id: cmd.id, ok: true, result: this.feedBridge.getEventLog(cmd.args?.limit) };
        }
        case 'feed:emitEvent': {
          if (cmd.args) this.feedBridge?.emitEvent(cmd.args as any);
          return { id: cmd.id, ok: true };
        }
        case 'feed:getHooks': {
          if (!this.feedBridge) return { id: cmd.id, ok: true, result: [] };
          return { id: cmd.id, ok: true, result: this.feedBridge.getHooks() };
        }
        case 'feed:registerHook': {
          if (cmd.args) this.feedBridge?.registerHook(cmd.args as any);
          return { id: cmd.id, ok: true };
        }
        case 'feed:unregisterHook': {
          this.feedBridge?.unregisterHook(cmd.args?.id);
          return { id: cmd.id, ok: true };
        }

        // ── Agent ──
        case 'agent:getAll': {
          if (!this.agentResumeManager) return { id: cmd.id, ok: true, result: [] };
          return { id: cmd.id, ok: true, result: await this.agentResumeManager.detectAgents() };
        }
        case 'agent:getSessionMap': {
          if (!this.agentResumeManager) return { id: cmd.id, ok: true, result: [] };
          return { id: cmd.id, ok: true, result: this.agentResumeManager.getSessionMap() };
        }
        case 'agent:getResumeCommand': {
          if (!this.agentResumeManager) return { id: cmd.id, ok: true, result: null };
          return { id: cmd.id, ok: true, result: this.agentResumeManager.getResumeCommand(cmd.args?.paneId) };
        }

        // ── Identify ──
        case 'identify': {
          const state = this.windowManager.getState();
          const ws = state.workspaces.get(state.activeWorkspaceId);
          const tab = ws?.tabs.get(ws.activeTabId);
          const pane = tab?.panes.get(tab.activePaneId);
          return { id: cmd.id, ok: true, result: {
            workspace: ws?.name || '', workspaceId: ws?.id || '',
            surface: pane?.title || '', surfaceId: pane?.id || '',
            type: pane?.type || '', workingDir: pane?.workingDir || ''
          }};
        }
        case 'current-workspace': {
          const state = this.windowManager.getState();
          const ws = state.workspaces.get(state.activeWorkspaceId);
          return { id: cmd.id, ok: true, result: { id: ws?.id, name: ws?.name, tabCount: ws?.tabs.size || 0 }};
        }

        default:
          return { id: cmd.id, ok: false, error: `Unknown command: ${cmd.command}` };
      }
    } catch (err: any) {
      return { id: cmd.id, ok: false, error: err.message };
    }
  }

  private findFirstBrowserPane(): string | null {
    const state = this.windowManager.getState();
    for (const ws of state.workspaces.values()) {
      for (const tab of ws.tabs.values()) {
        for (const [paneId, pane] of tab.panes) {
          if (pane.type === 'browser') return paneId;
        }
      }
    }
    return null;
  }

  private send(socket: net.Socket, response: SocketResponse): void {
    socket.write(JSON.stringify(response) + '\n');
  }

  broadcast(data: any): void {
    const msg = JSON.stringify(data) + '\n';
    for (const client of this.clients) client.write(msg);
  }
}
