import { BrowserWindow, webContents } from 'electron';
import * as path from 'path';

export interface BrowserInstance {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

export class BrowserManager {
  private browsers: Map<string, BrowserInstance> = new Map();

  createBrowser(id: string, url?: string): BrowserInstance {
    const instance: BrowserInstance = {
      id,
      url: url || 'about:blank',
      title: 'New Tab',
      canGoBack: false,
      canGoForward: false
    };
    this.browsers.set(id, instance);
    return instance;
  }

  getBrowser(id: string): BrowserInstance | undefined {
    return this.browsers.get(id);
  }

  updateBrowser(id: string, updates: Partial<BrowserInstance>): void {
    const browser = this.browsers.get(id);
    if (browser) Object.assign(browser, updates);
  }

  removeBrowser(id: string): void {
    this.browsers.delete(id);
  }

  getAll(): BrowserInstance[] {
    return Array.from(this.browsers.values());
  }
}
