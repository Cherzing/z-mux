import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import { WindowManager } from './window-manager';
import { TerminalManager } from './terminal-manager';
import { BrowserManager } from './browser-manager';
import { SSHManager } from './ssh-manager';
import { NotificationManager } from './notification-manager';
import { SessionManager } from './session-manager';
import { SettingsManager } from './settings-manager';
import { AgentResumeManager } from './agent-resume';
import { CustomCommandsManager } from './custom-commands';
import { DockManager } from './dock-manager';

export function registerIPCHandlers(
  windowManager: WindowManager,
  terminalManager: TerminalManager,
  browserManager: BrowserManager,
  sshManager: SSHManager,
  notificationManager: NotificationManager,
  sessionManager: SessionManager,
  settingsManager: SettingsManager,
  agentResumeManager?: AgentResumeManager,
  customCommandsManager?: CustomCommandsManager,
  dockManager?: DockManager
) {
  // ── Window ──
  ipcMain.handle('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize());
  ipcMain.handle('window:maximize', () => {
    const w = BrowserWindow.getFocusedWindow();
    w && (w.isMaximized() ? w.unmaximize() : w.maximize());
  });
  ipcMain.handle('window:close', () => BrowserWindow.getFocusedWindow()?.close());
  ipcMain.handle('window:isMaximized', () => BrowserWindow.getFocusedWindow()?.isMaximized() || false);
  ipcMain.handle('window:toggleFullscreen', () => {
    const w = BrowserWindow.getFocusedWindow();
    if (w) w.setFullScreen(!w.isFullScreen());
  });

  // ── Workspace ──
  ipcMain.handle('workspace:create', (_, name?: string) => {
    const wsId = windowManager.createWorkspace(name);
    const paneId = windowManager.createSurface(wsId);
    terminalManager.createTerminal(paneId, { workspaceId: wsId });
    return { workspaceId: wsId, paneId };
  });

  ipcMain.handle('workspace:close', (_, id: string) => {
    const ws = windowManager.getState().workspaces.get(id);
    if (ws) {
      for (const tab of ws.tabs.values()) {
        for (const paneId of tab.panes.keys()) {
          terminalManager.killTerminal(paneId);
          sshManager.disconnect(paneId);
        }
      }
    }
    windowManager.closeWorkspace(id);
  });

  ipcMain.handle('workspace:select', (_, id: string) => windowManager.selectWorkspace(id));
  ipcMain.handle('workspace:rename', (_, id: string, name: string) => windowManager.renameWorkspace(id, name));
  ipcMain.handle('workspace:list', () => {
    const state = windowManager.getState();
    return Array.from(state.workspaces.entries()).map(([id, ws]) => ({ id, name: ws.name }));
  });
  ipcMain.handle('workspace:next', () => windowManager.nextWorkspace());
  ipcMain.handle('workspace:previous', () => windowManager.previousWorkspace());

  // ── Surface (terminal/tab/pane) ──
  ipcMain.handle('surface:create', (_, workspaceId: string, type: 'terminal' | 'browser' = 'terminal') => {
    const paneId = windowManager.createSurface(workspaceId, type);
    if (type === 'terminal') {
      terminalManager.createTerminal(paneId, { workspaceId });
    } else {
      browserManager.createBrowser(paneId);
    }
    return paneId;
  });

  ipcMain.handle('surface:close', (_, id: string) => {
    terminalManager.killTerminal(id);
    sshManager.disconnect(id);
    browserManager.removeBrowser(id);
    windowManager.closeSurface(id);
  });

  ipcMain.handle('surface:splitRight', (_, id: string) => {
    const wsId = windowManager.getState().activeWorkspaceId;
    const ws = windowManager.getState().workspaces.get(wsId);
    const tab = ws?.tabs.get(ws.activeTabId);
    const sourcePane = tab?.panes.get(id);
    const newPaneId = windowManager.splitPane(id, 'vertical');
    if (newPaneId) terminalManager.createTerminal(newPaneId, { workingDir: sourcePane?.workingDir, workspaceId: wsId });
    return newPaneId;
  });

  ipcMain.handle('surface:splitDown', (_, id: string) => {
    const wsId = windowManager.getState().activeWorkspaceId;
    const ws = windowManager.getState().workspaces.get(wsId);
    const tab = ws?.tabs.get(ws.activeTabId);
    const sourcePane = tab?.panes.get(id);
    const newPaneId = windowManager.splitPane(id, 'horizontal');
    if (newPaneId) terminalManager.createTerminal(newPaneId, { workingDir: sourcePane?.workingDir, workspaceId: wsId });
    return newPaneId;
  });

  ipcMain.handle('surface:sendInput', (_, id: string, data: string) => {
    terminalManager.writeToTerminal(id, data);
  });

  ipcMain.handle('surface:resize', (_, id: string, cols: number, rows: number) => {
    terminalManager.resizeTerminal(id, cols, rows);
  });

  ipcMain.handle('surface:focus', (_, id: string) => {
    windowManager.updatePaneState(id, {} as any);
  });

  ipcMain.handle('surface:zoom', (_, id: string) => {
    windowManager.togglePaneZoom(id);
  });

  ipcMain.handle('surface:rename', (_, id: string, name: string) => {
    windowManager.updatePaneState(id, { title: name } as any);
  });

  // ── Browser ──
  ipcMain.handle('browser:navigate', (_, id: string, url: string) => {
    browserManager.updateBrowser(id, { url });
    return url;
  });

  ipcMain.handle('browser:back', (_, id: string) => {});
  ipcMain.handle('browser:forward', (_, id: string) => {});
  ipcMain.handle('browser:reload', (_, id: string) => {});
  ipcMain.handle('browser:getState', (_, id: string) => browserManager.getBrowser(id));

  // ── SSH ──
  ipcMain.handle('ssh:connect', async (_, id: string, target: string, options?: any) => {
    try {
      const config = sshManager.parseTarget(target);
      if (options?.port) config.port = options.port;
      if (options?.key) (config as any).privateKey = require('fs').readFileSync(options.key);
      if (options?.password) config.password = options.password;
      await sshManager.connect(id, config);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ssh:disconnect', (_, id: string) => sshManager.disconnect(id));

  // ── Notifications ──
  ipcMain.handle('notification:getAll', () => notificationManager.getAll());
  ipcMain.handle('notification:markRead', (_, id: string) => notificationManager.markRead(id));
  ipcMain.handle('notification:markAllRead', () => notificationManager.markAllRead());
  ipcMain.handle('notification:jumpToLatest', () => {
    const latest = notificationManager.getLatestUnread();
    if (latest) {
      notificationManager.markRead(latest.id);
      // Focus the workspace/surface
      windowManager.selectWorkspace(latest.workspaceId);
    }
    return latest;
  });
  ipcMain.handle('notification:toggleUnread', (_, id: string) => notificationManager.toggleUnread(id));

  // ── Settings ──
  ipcMain.handle('settings:get', () => settingsManager.getAll());
  ipcMain.handle('settings:set', (_, settings: any) => {
    settingsManager.set(settings);
    BrowserWindow.getAllWindows()[0]?.webContents.send('settings:changed', settingsManager.getAll());
  });

  // ── Session ──
  ipcMain.handle('session:restore', async () => {
    const session = await sessionManager.restoreLastSession();
    return session;
  });
  ipcMain.handle('session:save', () => {
    sessionManager.saveCurrentSession(windowManager.getState());
  });

  // ── Git Info ──
  ipcMain.handle('git:getInfo', async (_, cwd: string) => {
    const { getGitInfo } = await import('./git-info');
    return getGitInfo(cwd);
  });

  // ── File Dialog ──
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('shell:openExternal', (_, url: string) => shell.openExternal(url));

  // ── Environment Variables for terminals ──
  ipcMain.handle('env:getSessionVars', (_, paneId: string) => {
    const state = windowManager.getState();
    let workspaceId = '';
    for (const [wsId, ws] of state.workspaces) {
      for (const tab of ws.tabs.values()) {
        if (tab.panes.has(paneId)) { workspaceId = wsId; break; }
      }
    }
    return {
      ZMUX_PANE_ID: paneId,
      ZMUX_WORKSPACE_ID: workspaceId,
      ZMUX: '1'
    };
  });

  // ── Agent Resume ──
  ipcMain.handle('agent:detect', async () => {
    if (!agentResumeManager) return [];
    return agentResumeManager.detectAgents();
  });
  ipcMain.handle('agent:getResumeCommand', (_, paneId: string) => {
    if (!agentResumeManager) return null;
    return agentResumeManager.getResumeCommand(paneId);
  });
  ipcMain.handle('agent:registerSession', (_, paneId: string, agent: string, sessionId: string, workingDir: string) => {
    agentResumeManager?.registerSession(paneId, agent, sessionId, workingDir);
  });
  ipcMain.handle('agent:installHooks', async () => {
    if (!agentResumeManager) return;
    await agentResumeManager.installHooks();
  });

  // ── Custom Commands ──
  ipcMain.handle('commands:getActions', () => {
    if (!customCommandsManager) return [];
    return customCommandsManager.getActions();
  });
  ipcMain.handle('commands:getWorkspaceCommands', () => {
    if (!customCommandsManager) return [];
    return customCommandsManager.getWorkspaceCommands();
  });
  ipcMain.handle('commands:getTabBarButtons', () => {
    if (!customCommandsManager) return [];
    return customCommandsManager.getTabBarButtons();
  });
  ipcMain.handle('commands:reload', () => {
    customCommandsManager?.reload();
  });

  // ── Dock ──
  ipcMain.handle('dock:getControls', () => {
    if (!dockManager) return [];
    return dockManager.getControls();
  });

  // ── Workspace Colors ──
  ipcMain.handle('workspace:setColor', (_, id: string, color: string) => {
    const ws = windowManager.getState().workspaces.get(id);
    if (ws) {
      (ws as any).color = color;
      windowManager['notify']?.();
    }
  });
}
