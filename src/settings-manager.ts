import Store from 'electron-store';
import { app } from 'electron';

export interface ZmuxSettings {
  terminal: {
    fontSize: number;
    fontFamily: string;
    theme: 'dark' | 'light' | 'custom';
    cursorStyle: 'block' | 'underline' | 'bar';
    cursorBlink: boolean;
    scrollback: number;
    shell?: string;
    shellArgs?: string[];
  };
  appearance: {
    sidebarWidth: number;
    tabHeight: number;
    showGitBranch: boolean;
    showPRStatus: boolean;
    showPorts: boolean;
    accentColor: string;
    showNotificationBadge: boolean;
  };
  shortcuts: Record<string, string>;
  agent: {
    autoResume: boolean;
    hookPath?: string;
  };
}

const defaults: ZmuxSettings = {
  terminal: {
    fontSize: 14,
    fontFamily: 'Cascadia Code, Consolas, monospace',
    theme: 'dark',
    cursorStyle: 'block',
    cursorBlink: true,
    scrollback: 10000
  },
  appearance: {
    sidebarWidth: 240,
    tabHeight: 36,
    showGitBranch: true,
    showPRStatus: true,
    showPorts: true,
    accentColor: '#4c71f2',
    showNotificationBadge: true
  },
  shortcuts: {
    newWorkspace: 'Ctrl+Shift+N',
    closeWorkspace: 'Ctrl+Shift+W',
    nextWorkspace: 'Ctrl+Tab',
    previousWorkspace: 'Ctrl+Shift+Tab',
    newTab: 'Ctrl+T',
    closeTab: 'Ctrl+W',
    splitRight: 'Ctrl+D',
    splitDown: 'Ctrl+Shift+D',
    commandPalette: 'Ctrl+Shift+P',
    toggleSidebar: 'Ctrl+B',
    toggleNotifications: 'Ctrl+Shift+E',
    jumpToNotification: 'Ctrl+Shift+U',
    find: 'Ctrl+F',
    copy: 'Ctrl+Shift+C',
    paste: 'Ctrl+Shift+V'
  },
  agent: {
    autoResume: true
  }
};

export class SettingsManager {
  private store: Store<ZmuxSettings>;

  constructor() {
    this.store = new Store<ZmuxSettings>({
      name: 'zmux-settings',
      defaults,
      schema: {
        terminal: {
          type: 'object',
          properties: {
            fontSize: { type: 'number', minimum: 8, maximum: 32 },
            fontFamily: { type: 'string' },
            theme: { type: 'string', enum: ['dark', 'light', 'custom'] },
            cursorStyle: { type: 'string', enum: ['block', 'underline', 'bar'] },
            cursorBlink: { type: 'boolean' },
            scrollback: { type: 'number', minimum: 100, maximum: 100000 }
          }
        },
        appearance: {
          type: 'object',
          properties: {
            sidebarWidth: { type: 'number', minimum: 160, maximum: 400 },
            tabHeight: { type: 'number', minimum: 28, maximum: 48 },
            showGitBranch: { type: 'boolean' },
            showPRStatus: { type: 'boolean' },
            showPorts: { type: 'boolean' },
            accentColor: { type: 'string' }
          }
        },
        shortcuts: { type: 'object' },
        agent: { type: 'object' }
      }
    });
  }

  getAll(): ZmuxSettings {
    return this.store.store;
  }

  getValue<K extends keyof ZmuxSettings>(key: K): ZmuxSettings[K] {
    return this.store.get(key);
  }

  set(settings: Partial<ZmuxSettings>): void {
    for (const [key, value] of Object.entries(settings)) {
      this.store.set(key, value);
    }
  }

  reset(): void {
    this.store.clear();
  }

  onChanged(callback: (settings: ZmuxSettings) => void): void {
    this.store.onDidChange('terminal', () => callback(this.getAll()));
    this.store.onDidChange('appearance', () => callback(this.getAll()));
  }
}
