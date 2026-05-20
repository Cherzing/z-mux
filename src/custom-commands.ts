import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CustomAction {
  id: string;
  label: string;
  type: 'command' | 'builtin';
  command?: string;
  args?: string[];
  cwd?: string;
  icon?: string;
  shortcut?: string;
  palette?: boolean;
  confirm?: boolean;
}

export interface ZmuxConfig {
  schemaVersion?: number;
  actions?: CustomAction[];
  workspaceCommands?: Array<{
    id: string;
    name: string;
    layout: Array<{
      command: string;
      cwd?: string;
      split?: 'horizontal' | 'vertical';
    }>;
  }>;
  ui?: {
    newWorkspace?: {
      action?: string;
      contextMenu?: Array<{ action: string; separator?: boolean }>;
    };
    surfaceTabBar?: {
      buttons?: Array<string | { action: string; label?: string; icon?: string }>;
    };
  };
}

export class CustomCommandsManager {
  private globalConfig: ZmuxConfig = {};
  private projectConfig: ZmuxConfig = {};
  private configDir: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'zmux');
  }

  loadGlobalConfig(): void {
    const configPath = path.join(this.configDir, 'zmux.json');
    this.globalConfig = this.readConfig(configPath);
  }

  loadProjectConfig(projectDir: string): void {
    const configPath = path.join(projectDir, '.zmux', 'zmux.json');
    this.projectConfig = this.readConfig(configPath);
  }

  private readConfig(configPath: string): ZmuxConfig {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        // Strip comments and trailing commas for JSON5-like support
        const cleaned = raw
          .replace(/\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(cleaned);
      }
    } catch (err) {
      console.warn(`Failed to parse config: ${configPath}`, err);
    }
    return {};
  }

  getActions(): CustomAction[] {
    const global = this.globalConfig.actions || [];
    const project = this.projectConfig.actions || [];
    // Project actions override global ones with same ID
    const merged = new Map<string, CustomAction>();
    for (const action of global) merged.set(action.id, action);
    for (const action of project) merged.set(action.id, action);
    return Array.from(merged.values());
  }

  getAction(id: string): CustomAction | undefined {
    return this.getActions().find((a) => a.id === id);
  }

  getWorkspaceCommands(): ZmuxConfig['workspaceCommands'] {
    return this.projectConfig.workspaceCommands || this.globalConfig.workspaceCommands || [];
  }

  getTabBarButtons(): Array<string | { action: string; label?: string; icon?: string }> {
    return this.projectConfig.ui?.surfaceTabBar?.buttons || this.globalConfig.ui?.surfaceTabBar?.buttons || [];
  }

  getNewWorkspaceAction(): string | undefined {
    return this.projectConfig.ui?.newWorkspace?.action || this.globalConfig.ui?.newWorkspace?.action;
  }

  getNewWorkspaceContextMenu(): Array<{ action: string; separator?: boolean }> {
    return this.projectConfig.ui?.newWorkspace?.contextMenu || this.globalConfig.ui?.newWorkspace?.contextMenu || [];
  }

  reload(): void {
    this.loadGlobalConfig();
  }
}
