import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('zmux', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
    onMaximized: (cb: (v: boolean) => void) => ipcRenderer.on('window:maximized', (_, v) => cb(v))
  },

  workspace: {
    create: (name?: string) => ipcRenderer.invoke('workspace:create', name),
    close: (id: string) => ipcRenderer.invoke('workspace:close', id),
    select: (id: string) => ipcRenderer.invoke('workspace:select', id),
    rename: (id: string, name: string) => ipcRenderer.invoke('workspace:rename', id, name),
    list: () => ipcRenderer.invoke('workspace:list'),
    next: () => ipcRenderer.invoke('workspace:next'),
    previous: () => ipcRenderer.invoke('workspace:previous'),
    onStateChanged: (cb: (state: any) => void) => ipcRenderer.on('workspace:stateChanged', (_, s) => cb(s))
  },

  surface: {
    create: (workspaceId: string, type?: string) => ipcRenderer.invoke('surface:create', workspaceId, type || 'terminal'),
    close: (id: string) => ipcRenderer.invoke('surface:close', id),
    splitRight: (id: string) => ipcRenderer.invoke('surface:splitRight', id),
    splitDown: (id: string) => ipcRenderer.invoke('surface:splitDown', id),
    sendInput: (id: string, data: string) => ipcRenderer.invoke('surface:sendInput', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('surface:resize', id, cols, rows),
    focus: (id: string) => ipcRenderer.invoke('surface:focus', id),
    zoom: (id: string) => ipcRenderer.invoke('surface:zoom', id),
    rename: (id: string, name: string) => ipcRenderer.invoke('surface:rename', id, name),
    onData: (cb: (id: string, data: string) => void) => ipcRenderer.on('surface:data', (_, id, data) => cb(id, data)),
    onExit: (cb: (id: string, code: number) => void) => ipcRenderer.on('surface:exit', (_, id, code) => cb(id, code)),
    onTitleChanged: (cb: (id: string, title: string) => void) => ipcRenderer.on('surface:titleChanged', (_, id, t) => cb(id, t))
  },

  browser: {
    navigate: (id: string, url: string) => ipcRenderer.invoke('browser:navigate', id, url),
    back: (id: string) => ipcRenderer.invoke('browser:back', id),
    forward: (id: string) => ipcRenderer.invoke('browser:forward', id),
    reload: (id: string) => ipcRenderer.invoke('browser:reload', id),
    getState: (id: string) => ipcRenderer.invoke('browser:getState', id)
  },

  ssh: {
    connect: (id: string, target: string, options?: any) => ipcRenderer.invoke('ssh:connect', id, target, options),
    disconnect: (id: string) => ipcRenderer.invoke('ssh:disconnect', id)
  },

  notification: {
    getAll: () => ipcRenderer.invoke('notification:getAll'),
    markRead: (id: string) => ipcRenderer.invoke('notification:markRead', id),
    markAllRead: () => ipcRenderer.invoke('notification:markAllRead'),
    jumpToLatest: () => ipcRenderer.invoke('notification:jumpToLatest'),
    toggleUnread: (id: string) => ipcRenderer.invoke('notification:toggleUnread', id),
    onNew: (cb: (n: any) => void) => ipcRenderer.on('notification:new', (_, n) => cb(n)),
    onStateChanged: (cb: (s: any) => void) => ipcRenderer.on('notification:stateChanged', (_, s) => cb(s))
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (s: any) => ipcRenderer.invoke('settings:set', s),
    onChanged: (cb: (s: any) => void) => ipcRenderer.on('settings:changed', (_, s) => cb(s))
  },

  git: {
    onInfo: (cb: (info: any) => void) => ipcRenderer.on('pane:gitInfo', (_, info) => cb(info)),
    getInfo: (cwd: string) => ipcRenderer.invoke('git:getInfo', cwd)
  },

  session: {
    restore: () => ipcRenderer.invoke('session:restore'),
    save: () => ipcRenderer.invoke('session:save'),
    onRestore: (cb: (session: any) => void) => ipcRenderer.on('session:restore', (_, s) => cb(s))
  },

  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory')
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },

  command: {
    onExecute: (cb: (cmd: string, args?: any) => void) => ipcRenderer.on('command', (_, cmd, args) => cb(cmd, args))
  },

  ipc: {
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, cb: (...args: any[]) => void) => {
      const handler = (_: any, ...args: any[]) => cb(...args);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },

  feed: {
    getEventLog: (limit?: number) => ipcRenderer.invoke('feed:getEventLog', limit),
    emitEvent: (event: any) => ipcRenderer.invoke('feed:emitEvent', event),
    getHooks: () => ipcRenderer.invoke('feed:getHooks'),
    registerHook: (hook: any) => ipcRenderer.invoke('feed:registerHook', hook),
    unregisterHook: (id: string) => ipcRenderer.invoke('feed:unregisterHook', id),
    onEvent: (cb: (event: any) => void) => {
      const handler = (_: any, event: any) => cb(event);
      ipcRenderer.on('feed:event', handler);
      return () => ipcRenderer.removeListener('feed:event', handler);
    }
  },

  agent: {
    detect: () => ipcRenderer.invoke('agent:detect'),
    getAll: () => ipcRenderer.invoke('agent:getAll'),
    getResumeCommand: (paneId: string) => ipcRenderer.invoke('agent:getResumeCommand', paneId),
    registerSession: (paneId: string, agent: string, sessionId: string, workingDir: string) =>
      ipcRenderer.invoke('agent:registerSession', paneId, agent, sessionId, workingDir),
    installHooks: () => ipcRenderer.invoke('agent:installHooks'),
    getSessionMap: () => ipcRenderer.invoke('agent:getSessionMap')
  },

  init: {
    onReady: (cb: (data: { workspaceId: string; paneId: string }) => void) =>
      ipcRenderer.on('init:ready', (_, data) => cb(data))
  }
});
