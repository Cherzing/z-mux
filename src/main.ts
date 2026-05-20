import { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { WindowManager } from './window-manager';
import { TerminalManager } from './terminal-manager';
import { BrowserManager } from './browser-manager';
import { SSHManager } from './ssh-manager';
import { SocketServer } from './socket-server';
import { NotificationManager } from './notification-manager';
import { SessionManager } from './session-manager';
import { SettingsManager } from './settings-manager';
import { registerIPCHandlers } from './ipc';
import { getGitInfo, getListeningPorts } from './git-info';
import { AgentResumeManager } from './agent-resume';
import { CustomCommandsManager } from './custom-commands';
import { DockManager } from './dock-manager';
import { setupBrowserAutomation } from './browser-automation';
import { FeedBridge } from './feed-bridge';

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager;
let terminalManager: TerminalManager;
let browserManager: BrowserManager;
let sshManager: SSHManager;
let socketServer: SocketServer;
let notificationManager: NotificationManager;
let sessionManager: SessionManager;
let settingsManager: SettingsManager;
let agentResumeManager: AgentResumeManager;
let customCommandsManager: CustomCommandsManager;
let dockManager: DockManager;
let feedBridge: FeedBridge;
let tray: Tray | null = null;

const isDev = process.argv.includes('--dev');
const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\z-mux'
  : path.join(app.getPath('temp'), 'z-mux.sock');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    backgroundColor: '#1e1e2e',
    titleBarOverlay: { color: '#181825', symbolColor: '#cdd6f4', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    },
    icon: getIconPath()
  });

  if (isDev) {
    win.loadURL('http://localhost:3001');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  win.on('closed', () => { mainWindow = null; });
  win.on('maximize', () => win.webContents.send('window:maximized', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized', false));

  mainWindow = win;
  return win;
}

function getIconPath(): string | undefined {
  const p = path.join(__dirname, '..', 'assets', 'icon.ico');
  return fs.existsSync(p) ? p : undefined;
}

function createTray() {
  try {
    const iconPath = getIconPath();
    if (!iconPath) return;
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) return;
    tray = new Tray(icon);
    tray.setToolTip('z-mux');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show z-mux', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'New Workspace', click: () => mainWindow?.webContents.send('command', 'workspace.new') },
      { label: 'New Tab', click: () => mainWindow?.webContents.send('command', 'tab.new') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
  } catch {}
}

function setupGlobalShortcuts() {
  const reg = (accel: string, cmd: string) => {
    globalShortcut.register(accel, () => mainWindow?.webContents.send('command', cmd));
  };
  reg('CommandOrControl+Shift+P', 'palette.open');
  reg('CommandOrControl+Shift+N', 'workspace.new');
  reg('CommandOrControl+Shift+U', 'notification.jumpLatest');
  reg('CommandOrControl+Shift+L', 'browser.open');
  reg('CommandOrControl+Shift+O', 'session.restore');
  reg('CommandOrControl+Shift+I', 'notifications.toggle');
  reg('CommandOrControl+Shift+Enter', 'pane.zoom');
}

// Git info polling
const gitInfoCache = new Map<string, any>();
let gitPollTimer: NodeJS.Timeout | null = null;

function startGitInfoPolling() {
  const poll = async () => {
    const state = windowManager?.getState();
    if (!state) return;

    for (const ws of state.workspaces.values()) {
      for (const tab of ws.tabs.values()) {
        for (const [paneId, pane] of tab.panes) {
          if (pane.workingDir && pane.type === 'terminal') {
            try {
              const [git, ports] = await Promise.all([
                getGitInfo(pane.workingDir),
                getListeningPorts()
              ]);
              const info = { git, ports, paneId };
              gitInfoCache.set(paneId, info);
              mainWindow?.webContents.send('pane:gitInfo', info);
            } catch {}
          }
        }
      }
    }
  };

  poll();
  gitPollTimer = setInterval(poll, 5000);
}

process.on('uncaughtException', (err) => console.error('Uncaught:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err));

app.whenReady().then(async () => {
  settingsManager = new SettingsManager();
  notificationManager = new NotificationManager();
  sessionManager = new SessionManager(app.getPath('userData'));
  terminalManager = new TerminalManager();
  browserManager = new BrowserManager();
  sshManager = new SSHManager();
  agentResumeManager = new AgentResumeManager();
  customCommandsManager = new CustomCommandsManager();
  dockManager = new DockManager();
  feedBridge = new FeedBridge();
  feedBridge.installBuiltinHooks();

  // Terminal events → renderer
  terminalManager.on('data', (id: string, data: string) => {
    mainWindow?.webContents.send('surface:data', id, data);
    // Parse OSC sequences for notifications
    notificationManager.parseOSCSequence(id, data);
    // Parse agent events for feed bridge
    const ws = windowManager.findWorkspaceByPaneId?.(id) || '';
    feedBridge.parseAgentOSC(id, ws, data);
  });
  terminalManager.on('exit', (id: string, code: number) => {
    mainWindow?.webContents.send('surface:exit', id, code);
  });
  terminalManager.on('title', (id: string, title: string) => {
    mainWindow?.webContents.send('surface:titleChanged', id, title);
  });

  // SSH events → renderer
  sshManager.on('data', (id: string, data: string) => {
    mainWindow?.webContents.send('surface:data', id, data);
  });
  sshManager.on('exit', (id: string, code: number) => {
    mainWindow?.webContents.send('surface:exit', id, code);
  });

  // Notification events → renderer
  notificationManager.on('new', (n: any) => {
    mainWindow?.webContents.send('notification:new', n);
    windowManager.updatePaneState(n.surfaceId, { hasNotification: true } as any);
  });
  notificationManager.on('stateChanged', (s: any) => {
    mainWindow?.webContents.send('notification:stateChanged', s);
  });

  // Feed bridge events → renderer
  feedBridge.on('event', (event: any) => {
    mainWindow?.webContents.send('feed:event', event);
    // Auto-notify on agentStop waiting_for_input
    if (event.type === 'agentStop' && event.payload?.reason === 'waiting_for_input') {
      notificationManager.addNotification({
        surfaceId: event.surfaceId,
        workspaceId: event.workspaceId,
        title: `${event.source} Waiting`,
        body: event.payload.message || 'Input needed',
        type: 'agent-waiting'
      });
    }
  });

  const win = createWindow();
  windowManager = new WindowManager(win);
  socketServer = new SocketServer(SOCKET_PATH, windowManager, terminalManager, browserManager, sshManager, notificationManager, feedBridge, agentResumeManager);

  registerIPCHandlers(windowManager, terminalManager, browserManager, sshManager, notificationManager, sessionManager, settingsManager, agentResumeManager, customCommandsManager, dockManager, feedBridge);
  setupBrowserAutomation();
  createTray();
  setupGlobalShortcuts();

  await socketServer.start();

  win.webContents.on('did-finish-load', () => {
    const wsId = windowManager.createWorkspace('Main');
    const paneId = windowManager.createSurface(wsId);
    terminalManager.createTerminal(paneId, { workspaceId: wsId });
    win.webContents.send('init:ready', { workspaceId: wsId, paneId });
    startGitInfoPolling();

    // Detect agents and load configs
    agentResumeManager.detectAgents().then((agents) => {
      const detected = agents.filter((a) => a.detected).map((a) => a.displayName);
      if (detected.length > 0) console.log(`Detected agents: ${detected.join(', ')}`);
    });
    customCommandsManager.loadGlobalConfig();
    dockManager.loadGlobalConfig();
  });

  sessionManager.restoreLastSession().then((session) => {
    if (session) win.webContents.send('session:restore', session);
  });

  console.log(`z-mux started. Socket: ${SOCKET_PATH}`);
});

app.on('window-all-closed', () => {
  sessionManager?.saveCurrentSession(windowManager?.getState());
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (gitPollTimer) clearInterval(gitPollTimer);
  socketServer?.stop();
  terminalManager?.killAll();
  sshManager?.disconnectAll();
  sessionManager?.saveCurrentSession(windowManager?.getState());
});
