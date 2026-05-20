import { EventEmitter } from 'events';

let Client: any;
try { Client = require('ssh2').Client; } catch {}

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface SSHInstance {
  id: string;
  config: SSHConfig;
  connected: boolean;
  shell?: any;
}

export class SSHManager extends EventEmitter {
  private sessions: Map<string, SSHInstance> = new Map();

  parseTarget(target: string): SSHConfig {
    let username = 'root';
    let host = target;
    let port = 22;

    if (target.includes('@')) {
      [username, host] = target.split('@');
    }
    if (host.includes(':')) {
      const [h, p] = host.split(':');
      host = h;
      port = parseInt(p, 10);
    }

    return { host, port, username };
  }

  async connect(id: string, config: SSHConfig): Promise<SSHInstance> {
    const instance: SSHInstance = { id, config, connected: false };
    this.sessions.set(id, instance);

    try {
      if (!Client) throw new Error('ssh2 not installed. Run: npm install ssh2');
      const conn = new Client();
      await new Promise<void>((resolve, reject) => {
        conn.on('ready', () => {
          instance.connected = true;
          conn.shell({ term: 'xterm-256color' }, (err: any, stream: any) => {
            if (err) { reject(err); return; }
            instance.shell = stream;
            stream.on('data', (data: Buffer) => this.emit('data', id, data.toString()));
            stream.on('close', () => {
              instance.connected = false;
              this.emit('exit', id, 0);
            });
            resolve();
          });
        });
        conn.on('error', reject);
        conn.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          privateKey: config.privateKey,
          passphrase: config.passphrase,
          readyTimeout: 10000,
          keepaliveInterval: 20000,
          keepaliveCountMax: 2
        });
      });
    } catch (err) {
      instance.connected = false;
      throw err;
    }

    return instance;
  }

  writeToSession(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session?.shell) session.shell.write(data);
  }

  resizeSession(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session?.shell) session.shell.setWindow(rows, cols, 0, 0);
  }

  disconnect(id: string): void {
    const session = this.sessions.get(id);
    if (session?.shell) session.shell.close();
    this.sessions.delete(id);
  }

  getSession(id: string): SSHInstance | undefined {
    return this.sessions.get(id);
  }

  disconnectAll(): void {
    for (const id of this.sessions.keys()) this.disconnect(id);
  }
}
