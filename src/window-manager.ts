import { BrowserWindow } from 'electron';

export interface PaneState {
  id: string;
  type: 'terminal' | 'browser';
  title: string;
  workingDir: string;
  gitBranch?: string;
  prStatus?: string;
  listeningPorts?: number[];
  lastNotification?: string;
  hasNotification: boolean;
  splitDirection?: 'horizontal' | 'vertical';
  children?: string[];
  zoomed?: boolean;
}

export interface TabState {
  id: string;
  name: string;
  panes: Map<string, PaneState>;
  activePaneId: string;
  layout: LayoutNode;
}

export interface WorkspaceState {
  id: string;
  name: string;
  description?: string;
  tabs: Map<string, TabState>;
  activeTabId: string;
}

export type LayoutNode = {
  type: 'leaf';
  paneId: string;
} | {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  children: LayoutNode[];
  sizes: number[];
};

export interface AppState {
  workspaces: Map<string, WorkspaceState>;
  activeWorkspaceId: string;
  sidebarVisible: boolean;
  rightSidebarVisible: boolean;
}

export class WindowManager {
  private window: BrowserWindow;
  private state: AppState;

  constructor(window: BrowserWindow) {
    this.window = window;
    this.state = {
      workspaces: new Map(),
      activeWorkspaceId: '',
      sidebarVisible: true,
      rightSidebarVisible: false
    };
  }

  getState(): AppState {
    return this.state;
  }

  private notify() {
    const serialized = this.serializeState();
    this.window.webContents.send('workspace:stateChanged', serialized);
  }

  private serializeState() {
    return {
      workspaces: Array.from(this.state.workspaces.entries()).map(([id, ws]) => ({
        id,
        name: ws.name,
        description: ws.description,
        activeTabId: ws.activeTabId,
        tabs: Array.from(ws.tabs.entries()).map(([tabId, tab]) => ({
          id: tabId,
          name: tab.name,
          activePaneId: tab.activePaneId,
          panes: Array.from(tab.panes.entries()).map(([paneId, pane]) => ({
            ...pane,
            id: paneId
          })),
          layout: tab.layout
        }))
      })),
      activeWorkspaceId: this.state.activeWorkspaceId,
      sidebarVisible: this.state.sidebarVisible,
      rightSidebarVisible: this.state.rightSidebarVisible
    };
  }

  createWorkspace(name?: string): string {
    const id = `workspace:${Date.now()}`;
    const workspace: WorkspaceState = {
      id,
      name: name || `Workspace ${this.state.workspaces.size + 1}`,
      tabs: new Map(),
      activeTabId: ''
    };
    this.state.workspaces.set(id, workspace);
    this.state.activeWorkspaceId = id;
    this.notify();
    return id;
  }

  closeWorkspace(id: string): void {
    this.state.workspaces.delete(id);
    if (this.state.activeWorkspaceId === id) {
      const remaining = Array.from(this.state.workspaces.keys());
      this.state.activeWorkspaceId = remaining[remaining.length - 1] || '';
    }
    this.notify();
  }

  selectWorkspace(id: string): void {
    if (this.state.workspaces.has(id)) {
      this.state.activeWorkspaceId = id;
      this.notify();
    }
  }

  renameWorkspace(id: string, name: string): void {
    const ws = this.state.workspaces.get(id);
    if (ws) {
      ws.name = name;
      this.notify();
    }
  }

  nextWorkspace(): void {
    const ids = Array.from(this.state.workspaces.keys());
    const idx = ids.indexOf(this.state.activeWorkspaceId);
    if (idx >= 0 && ids.length > 0) {
      this.state.activeWorkspaceId = ids[(idx + 1) % ids.length];
      this.notify();
    }
  }

  previousWorkspace(): void {
    const ids = Array.from(this.state.workspaces.keys());
    const idx = ids.indexOf(this.state.activeWorkspaceId);
    if (idx >= 0 && ids.length > 0) {
      this.state.activeWorkspaceId = ids[(idx - 1 + ids.length) % ids.length];
      this.notify();
    }
  }

  createSurface(workspaceId: string, type: 'terminal' | 'browser' = 'terminal'): string {
    const ws = this.state.workspaces.get(workspaceId);
    if (!ws) return '';

    const paneId = `pane:${Date.now()}`;
    const tabId = `tab:${Date.now()}`;

    const pane: PaneState = {
      id: paneId,
      type,
      title: type === 'terminal' ? 'Terminal' : 'Browser',
      workingDir: process.env.USERPROFILE || process.env.HOME || 'C:\\',
      hasNotification: false
    };

    const tab: TabState = {
      id: tabId,
      name: `Tab ${ws.tabs.size + 1}`,
      panes: new Map([[paneId, pane]]),
      activePaneId: paneId,
      layout: { type: 'leaf', paneId }
    };

    ws.tabs.set(tabId, tab);
    ws.activeTabId = tabId;
    this.notify();
    return paneId;
  }

  closeSurface(paneId: string): void {
    for (const ws of this.state.workspaces.values()) {
      for (const [tabId, tab] of ws.tabs) {
        if (tab.panes.has(paneId)) {
          tab.panes.delete(paneId);
          if (tab.panes.size === 0) {
            ws.tabs.delete(tabId);
            if (ws.activeTabId === tabId) {
              const remaining = Array.from(ws.tabs.keys());
              ws.activeTabId = remaining[remaining.length - 1] || '';
            }
          } else if (tab.activePaneId === paneId) {
            tab.activePaneId = Array.from(tab.panes.keys())[0];
          }
          this.notify();
          return;
        }
      }
    }
  }

  splitPane(paneId: string, direction: 'horizontal' | 'vertical'): string | null {
    for (const ws of this.state.workspaces.values()) {
      for (const tab of ws.tabs.values()) {
        if (tab.panes.has(paneId)) {
          const newPaneId = `pane:${Date.now()}`;
          const sourcePane = tab.panes.get(paneId)!;
          const newPane: PaneState = {
            id: newPaneId,
            type: sourcePane.type,
            title: sourcePane.title,
            workingDir: sourcePane.workingDir,
            hasNotification: false
          };
          tab.panes.set(newPaneId, newPane);
          this.updateLayout(tab, paneId, newPaneId, direction);
          this.notify();
          return newPaneId;
        }
      }
    }
    return null;
  }

  private updateLayout(tab: TabState, existingPaneId: string, newPaneId: string, direction: 'horizontal' | 'vertical') {
    const newLeaf: LayoutNode = { type: 'leaf', paneId: newPaneId };
    const existingLeaf: LayoutNode = { type: 'leaf', paneId: existingPaneId };

    if (tab.layout.type === 'leaf') {
      tab.layout = {
        type: 'split',
        direction,
        children: [existingLeaf, newLeaf],
        sizes: [50, 50]
      };
    } else {
      tab.layout = {
        type: 'split',
        direction,
        children: [tab.layout, newLeaf],
        sizes: new Array(tab.layout.children.length + 1).fill(
          100 / (tab.layout.children.length + 1)
        )
      };
    }
  }

  updatePaneState(paneId: string, updates: Partial<PaneState>): void {
    for (const ws of this.state.workspaces.values()) {
      for (const tab of ws.tabs.values()) {
        const pane = tab.panes.get(paneId);
        if (pane) {
          Object.assign(pane, updates);
          this.notify();
          return;
        }
      }
    }
  }

  toggleSidebar(): void {
    this.state.sidebarVisible = !this.state.sidebarVisible;
    this.notify();
  }

  toggleRightSidebar(): void {
    this.state.rightSidebarVisible = !this.state.rightSidebarVisible;
    this.notify();
  }

  togglePaneZoom(paneId: string): void {
    for (const ws of this.state.workspaces.values()) {
      for (const tab of ws.tabs.values()) {
        const pane = tab.panes.get(paneId);
        if (pane) {
          // Toggle zoom: if this pane is zoomed, unzoom; if not, zoom it
          const wasZoomed = pane.zoomed;
          for (const p of tab.panes.values()) p.zoomed = false;
          pane.zoomed = !wasZoomed;
          this.notify();
          return;
        }
      }
    }
  }

  findPaneBySurface(surfaceId: string): PaneState | null {
    for (const ws of this.state.workspaces.values()) {
      for (const tab of ws.tabs.values()) {
        const pane = tab.panes.get(surfaceId);
        if (pane) return pane;
      }
    }
    return null;
  }

  findWorkspaceByPaneId(paneId: string): string {
    for (const [wsId, ws] of this.state.workspaces) {
      for (const tab of ws.tabs.values()) {
        if (tab.panes.has(paneId)) return wsId;
      }
    }
    return '';
  }

  getActiveWorkspace(): WorkspaceState | null {
    return this.state.workspaces.get(this.state.activeWorkspaceId) || null;
  }
}
