import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AgentHook {
  name: string;
  scriptPath: string;
  agentPath?: string;
  installed: boolean;
}

export class HooksManager {
  private hooksDir: string;
  private zmuxHome: string;

  constructor() {
    this.zmuxHome = path.join(os.homedir(), '.zmuxterm');
    this.hooksDir = path.join(this.zmuxHome, 'hooks');
    this.ensureDirs();
  }

  private ensureDirs() {
    for (const dir of [this.zmuxHome, this.hooksDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  async setup(): Promise<AgentHook[]> {
    const agents = this.detectAgents();
    const hooks: AgentHook[] = [];

    for (const agent of agents) {
      const scriptPath = path.join(this.hooksDir, `${agent.name}.sh`);
      const hookScript = this.generateHookScript(agent.name);

      fs.writeFileSync(scriptPath, hookScript, { mode: 0o755 });

      hooks.push({
        name: agent.name,
        scriptPath,
        agentPath: agent.path,
        installed: true
      });
    }

    return hooks;
  }

  async setupAgent(name: string): Promise<AgentHook | null> {
    const agents = this.detectAgents();
    const agent = agents.find(a => a.name === name);
    if (!agent) return null;

    const scriptPath = path.join(this.hooksDir, `${name}.sh`);
    const hookScript = this.generateHookScript(name);

    fs.writeFileSync(scriptPath, hookScript, { mode: 0o755 });

    return {
      name,
      scriptPath,
      agentPath: agent.path,
      installed: true
    };
  }

  private detectAgents(): Array<{ name: string; path: string }> {
    const agents: Array<{ name: string; path: string }> = [];

    const checks = [
      { name: 'claude-code', paths: [
        path.join(os.homedir(), '.claude', 'bin', 'claude'),
        'C:\\Program Files\\Claude\\claude.exe'
      ]},
      { name: 'codex', paths: [
        path.join(os.homedir(), '.codex', 'bin', 'codex'),
        'C:\\Program Files\\Codex\\codex.exe'
      ]},
      { name: 'opencode', paths: [
        path.join(os.homedir(), '.opencode', 'bin', 'opencode')
      ]}
    ];

    for (const check of checks) {
      for (const p of check.paths) {
        if (fs.existsSync(p)) {
          agents.push({ name: check.name, path: p });
          break;
        }
      }
    }

    return agents;
  }

  private generateHookScript(agentName: string): string {
    return `@echo off
REM z-mux hook for ${agentName}
zmux notify -t "${agentName} Waiting" -b "Input needed" --type agent-waiting
`;
  }

  getHooks(): AgentHook[] {
    if (!fs.existsSync(this.hooksDir)) return [];

    return fs.readdirSync(this.hooksDir)
      .filter(f => f.endsWith('.sh') || f.endsWith('.bat'))
      .map(f => ({
        name: path.basename(f, path.extname(f)),
        scriptPath: path.join(this.hooksDir, f),
        installed: true
      }));
  }

  async runHook(name: string): Promise<boolean> {
    const hookPath = path.join(this.hooksDir, `${name}.bat`);
    if (!fs.existsSync(hookPath)) return false;

    try {
      await execAsync(hookPath);
      return true;
    } catch {
      return false;
    }
  }
}
