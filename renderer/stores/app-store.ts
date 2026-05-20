import { create } from 'zustand';

export interface GitInfo {
  branch: string;
  prNumber?: string;
  prStatus?: 'open' | 'merged' | 'closed';
  isDirty: boolean;
  ahead: number;
  behind: number;
}

export interface Pane {
  id: string;
  type: 'terminal' | 'browser';
  title: string;
  workingDir: string;
  git?: GitInfo;
  listeningPorts?: number[];
  lastNotification?: string;
  hasNotification: boolean;
  zoomed?: boolean;
}

export interface Tab {
  id: string;
  name: string;
  panes: Pane[];
  activePaneId: string;
  layout: LayoutNode;
}

export type LayoutNode =
  | { type: 'leaf'; paneId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: LayoutNode[]; sizes: number[] };

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  tabs: Tab[];
  activeTabId: string;
  color?: string;
}

export interface ZmuxNotification {
  id: string;
  surfaceId: string;
  workspaceId: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  type: string;
}

interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  sidebarVisible: boolean;
  rightSidebarVisible: boolean;
  notifications: ZmuxNotification[];
  unreadCount: number;
  commandPaletteOpen: boolean;
  workspaceSwitcherOpen: boolean;
  settingsOpen: boolean;
  windowMaximized: boolean;
  findBarVisible: boolean;
  findText: string;
  copyMode: boolean;

  addWorkspace: (id: string, name?: string, initialPaneId?: string) => void;
  removeWorkspace: (id: string) => void;
  setActiveWorkspaceId: (id: string) => void;
  addPaneToWorkspace: (workspaceId: string, paneId: string, type?: 'terminal' | 'browser') => void;
  removePane: (paneId: string) => void;
  setActivePane: (workspaceId: string, tabId: string, paneId: string) => void;
  updatePaneTitle: (paneId: string, title: string) => void;
  updatePaneGit: (paneId: string, git: GitInfo, ports?: number[]) => void;
  setPaneNotification: (paneId: string, has: boolean) => void;
  toggleSidebar: () => void;
  toggleRightSidebar: () => void;
  setNotifications: (notifications: ZmuxNotification[], unreadCount: number) => void;
  addNotification: (notification: ZmuxNotification) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setWorkspaceSwitcherOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setWindowMaximized: (maximized: boolean) => void;
  setFindBarVisible: (visible: boolean) => void;
  setFindText: (text: string) => void;
  setCopyMode: (on: boolean) => void;
  getActiveWorkspace: () => Workspace | undefined;
  getActiveTab: () => Tab | undefined;
  getActivePane: () => Pane | undefined;
}

let tabCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: '',
  sidebarVisible: true,
  rightSidebarVisible: false,
  notifications: [],
  unreadCount: 0,
  commandPaletteOpen: false,
  workspaceSwitcherOpen: false,
  settingsOpen: false,
  windowMaximized: false,
  findBarVisible: false,
  findText: '',
  copyMode: false,

  addWorkspace: (id, name, initialPaneId) => {
    const paneId = initialPaneId || `pane:${Date.now()}`;
    const tabId = `tab:${++tabCounter}`;
    const pane: Pane = { id: paneId, type: 'terminal', title: 'Terminal', workingDir: '', hasNotification: false };
    const tab: Tab = { id: tabId, name: 'Tab 1', panes: [pane], activePaneId: paneId, layout: { type: 'leaf', paneId } };
    const ws: Workspace = { id, name: name || `Workspace ${get().workspaces.length + 1}`, tabs: [tab], activeTabId: tabId };
    set((s) => ({ workspaces: [...s.workspaces, ws] }));
  },

  removeWorkspace: (id) => set((s) => {
    const remaining = s.workspaces.filter((w) => w.id !== id);
    return {
      workspaces: remaining,
      activeWorkspaceId: s.activeWorkspaceId === id ? (remaining[0]?.id || '') : s.activeWorkspaceId
    };
  }),

  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  addPaneToWorkspace: (workspaceId, paneId, type = 'terminal') => {
    const pane: Pane = { id: paneId, type, title: type === 'terminal' ? 'Terminal' : 'Browser', workingDir: '', hasNotification: false };
    const tabId = `tab:${++tabCounter}`;
    const tab: Tab = { id: tabId, name: `Tab ${(get().getActiveWorkspace()?.tabs.length || 0) + 1}`, panes: [pane], activePaneId: paneId, layout: { type: 'leaf', paneId } };
    set((s) => ({
      workspaces: s.workspaces.map((ws) =>
        ws.id === workspaceId ? { ...ws, tabs: [...ws.tabs, tab], activeTabId: tabId } : ws
      )
    }));
  },

  removePane: (paneId) => set((s) => ({
    workspaces: s.workspaces.map((ws) => ({
      ...ws,
      tabs: ws.tabs
        .map((tab) => ({
          ...tab,
          panes: tab.panes.filter((p) => p.id !== paneId),
          activePaneId: tab.activePaneId === paneId
            ? (tab.panes.find((p) => p.id !== paneId)?.id || '')
            : tab.activePaneId
        }))
        .filter((tab) => tab.panes.length > 0),
      activeTabId: ws.tabs.find((t) => t.id === ws.activeTabId)?.panes.length === 0
        ? (ws.tabs.find((t) => t.panes.length > 0)?.id || '')
        : ws.activeTabId
    }))
  })),

  setActivePane: (workspaceId, tabId, paneId) => set((s) => ({
    workspaces: s.workspaces.map((ws) =>
      ws.id === workspaceId
        ? { ...ws, tabs: ws.tabs.map((t) => t.id === tabId ? { ...t, activePaneId: paneId } : t) }
        : ws
    )
  })),

  updatePaneTitle: (paneId, title) => set((s) => ({
    workspaces: s.workspaces.map((ws) => ({
      ...ws,
      tabs: ws.tabs.map((t) => ({
        ...t,
        panes: t.panes.map((p) => p.id === paneId ? { ...p, title } : p)
      }))
    }))
  })),

  updatePaneGit: (paneId, git, ports) => set((s) => ({
    workspaces: s.workspaces.map((ws) => ({
      ...ws,
      tabs: ws.tabs.map((t) => ({
        ...t,
        panes: t.panes.map((p) => p.id === paneId ? { ...p, git, listeningPorts: ports || p.listeningPorts } : p)
      }))
    }))
  })),

  setPaneNotification: (paneId, has) => set((s) => ({
    workspaces: s.workspaces.map((ws) => ({
      ...ws,
      tabs: ws.tabs.map((t) => ({
        ...t,
        panes: t.panes.map((p) => p.id === paneId ? { ...p, hasNotification: has } : p)
      }))
    }))
  })),

  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  toggleRightSidebar: () => set((s) => ({ rightSidebarVisible: !s.rightSidebarVisible })),
  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),
  addNotification: (notification) => set((s) => ({
    notifications: [notification, ...s.notifications],
    unreadCount: s.unreadCount + (notification.read ? 0 : 1)
  })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setWorkspaceSwitcherOpen: (open) => set({ workspaceSwitcherOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setWindowMaximized: (maximized) => set({ windowMaximized: maximized }),
  setFindBarVisible: (visible) => set({ findBarVisible: visible }),
  setFindText: (text) => set({ findText: text }),
  setCopyMode: (on) => set({ copyMode: on }),

  getActiveWorkspace: () => {
    const s = get();
    return s.workspaces.find((w) => w.id === s.activeWorkspaceId);
  },
  getActiveTab: () => {
    const ws = get().getActiveWorkspace();
    return ws?.tabs.find((t) => t.id === ws.activeTabId);
  },
  getActivePane: () => {
    const tab = get().getActiveTab();
    return tab?.panes.find((p) => p.id === tab.activePaneId);
  }
}));
