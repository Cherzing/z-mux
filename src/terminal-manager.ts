import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface TerminalInstance {
  id: string;
  pty: pty.IPty;
  title: string;
  workingDir: string;
  pid: number;
}

export class TerminalManager extends EventEmitter {
  private terminals: Map<string, TerminalInstance> = new Map();
  private shell: string;
  private shellArgs: string[];

  constructor() {
    super();
    this.shell = this.detectShell();
    this.shellArgs = this.getShellArgs();
  }

  private detectShell(): string {
    if (process.platform === 'win32') {
      const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
      if (fs.existsSync(pwsh)) return pwsh;
      const ps = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32\\WindowsPowerShell\\v1.0\\powershell.exe');
      if (fs.existsSync(ps)) return ps;
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  private getShellArgs(): string[] {
    if (this.shell.includes('pwsh') || this.shell.includes('powershell')) return ['-NoLogo', '-NoExit'];
    if (this.shell.includes('cmd')) return ['/K'];
    return [];
  }

  createTerminal(id: string, options: { workingDir?: string; cols?: number; rows?: number; workspaceId?: string } = {}): TerminalInstance {
    const workingDir = options.workingDir || os.homedir();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ZMUX: '1',
      ZMUX_PANE_ID: id,
      ZMUX_SURFACE_ID: id,
      ZMUX_WORKSPACE_ID: options.workspaceId || ''
    };

    const ptyProcess = pty.spawn(this.shell, this.shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workingDir,
      env,
      useConpty: true
    });

    const terminal: TerminalInstance = { id, pty: ptyProcess, title: this.shell, workingDir, pid: ptyProcess.pid };
    this.terminals.set(id, terminal);

    ptyProcess.onData((data) => {
      this.emit('data', id, data);
      // Parse title changes from ANSI escape sequences
      const titleMatch = data.match(/\x1b\]0;(.+?)\x07/) || data.match(/\x1b\]2;(.+?)\x07/);
      if (titleMatch) {
        terminal.title = titleMatch[1];
        this.emit('title', id, titleMatch[1]);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.terminals.delete(id);
      this.emit('exit', id, exitCode);
    });

    return terminal;
  }

  writeToTerminal(id: string, data: string): void {
    this.terminals.get(id)?.pty.write(data);
  }

  resizeTerminal(id: string, cols: number, rows: number): void {
    this.terminals.get(id)?.pty.resize(cols, rows);
  }

  killTerminal(id: string): void {
    const t = this.terminals.get(id);
    if (t) { t.pty.kill(); this.terminals.delete(id); }
  }

  getTerminal(id: string): TerminalInstance | undefined {
    return this.terminals.get(id);
  }

  killAll(): void {
    for (const t of this.terminals.values()) t.pty.kill();
    this.terminals.clear();
  }
}
