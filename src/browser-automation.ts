import { BrowserWindow, ipcMain } from 'electron';

export interface AutomationResult {
  ok: boolean;
  result?: any;
  error?: string;
}

const pendingRequests = new Map<string, { resolve: (r: AutomationResult) => void; timeout: NodeJS.Timeout }>();

export function setupBrowserAutomation() {
  // Renderer sends results back here
  ipcMain.on('browser:automation:result', (_, requestId: string, result: AutomationResult) => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(requestId);
      pending.resolve(result);
    }
  });
}

export async function sendAutomationCommand(surfaceId: string, command: string, args?: any): Promise<AutomationResult> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false, error: 'No window' };

  const requestId = `auto:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ ok: false, error: 'Timeout' });
    }, 15000);

    pendingRequests.set(requestId, { resolve, timeout });
    win.webContents.send('browser:automation:command', requestId, surfaceId, command, args);
  });
}

// ── High-level automation API ──

export async function browserNavigate(surfaceId: string, url: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'navigate', { url });
}

export async function browserSnapshot(surfaceId: string, interactive = false): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'snapshot', { interactive });
}

export async function browserClick(surfaceId: string, selector: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'click', { selector });
}

export async function browserFill(surfaceId: string, selector: string, value: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'fill', { selector, value });
}

export async function browserType(surfaceId: string, selector: string, text: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'type', { selector, text });
}

export async function browserEval(surfaceId: string, expression: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'eval', { expression });
}

export async function browserGet(surfaceId: string, property: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'get', { property });
}

export async function browserScreenshot(surfaceId: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'screenshot', {});
}

export async function browserFind(surfaceId: string, selector: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'find', { selector });
}

export async function browserWait(surfaceId: string, options: { selector?: string; text?: string; url?: string; timeout?: number }): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'wait', options);
}

export async function browserPress(surfaceId: string, key: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'press', { key });
}

export async function browserSelect(surfaceId: string, selector: string, values: string[]): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'select', { selector, values });
}

export async function browserScroll(surfaceId: string, selector?: string, direction?: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'scroll', { selector, direction });
}

export async function browserCookies(surfaceId: string, action: 'get' | 'set' | 'clear', data?: any): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'cookies', { action, data });
}

export async function browserStorage(surfaceId: string, action: 'get' | 'set' | 'clear', data?: any): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'storage', { action, data });
}

export async function browserHighlight(surfaceId: string, selector: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'highlight', { selector });
}

export async function browserIs(surfaceId: string, selector: string, check: string): Promise<AutomationResult> {
  return sendAutomationCommand(surfaceId, 'is', { selector, check });
}
