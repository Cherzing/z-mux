import * as fs from 'fs';
import * as path from 'path';

interface SessionSnapshot {
  version: number;
  timestamp: number;
  workspaces: Array<{
    id: string;
    name: string;
    description?: string;
    tabs: Array<{
      id: string;
      name: string;
      panes: Array<{
        id: string;
        type: string;
        title: string;
        workingDir: string;
      }>;
      activePaneId: string;
    }>;
    activeTabId: string;
  }>;
  activeWorkspaceId: string;
  sidebarVisible: boolean;
}

export class SessionManager {
  private sessionDir: string;
  private sessionFile: string;

  constructor(userDataPath: string) {
    this.sessionDir = path.join(userDataPath, 'sessions');
    this.sessionFile = path.join(this.sessionDir, 'latest.json');

    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  saveCurrentSession(state: any): void {
    try {
      const workspaces = state.workspaces as Map<string, any>;
      const snapshot: SessionSnapshot = {
        version: 1,
        timestamp: Date.now(),
        workspaces: Array.from(workspaces.entries()).map(([id, ws]) => ({
          id,
          name: ws.name,
          description: ws.description,
          tabs: Array.from((ws.tabs as Map<string, any>).entries()).map(([tabId, tab]) => ({
            id: tabId,
            name: tab.name,
            panes: Array.from((tab.panes as Map<string, any>).entries()).map(([paneId, pane]) => ({
              id: paneId,
              type: pane.type,
              title: pane.title,
              workingDir: pane.workingDir
            })),
            activePaneId: tab.activePaneId
          })),
          activeTabId: ws.activeTabId
        })),
        activeWorkspaceId: state.activeWorkspaceId,
        sidebarVisible: state.sidebarVisible
      };

      fs.writeFileSync(this.sessionFile, JSON.stringify(snapshot, null, 2));
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }

  async restoreLastSession(): Promise<SessionSnapshot | null> {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const data = fs.readFileSync(this.sessionFile, 'utf-8');
        return JSON.parse(data) as SessionSnapshot;
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
    }
    return null;
  }

  listSessions(): string[] {
    try {
      return fs.readdirSync(this.sessionDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  getSnapshot(name: string): SessionSnapshot | null {
    try {
      const file = path.join(this.sessionDir, name);
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return null;
  }
}
