import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AgentInfo {
  name: string;
  displayName: string;
  binary: string;
  resumeCommand: (sessionId: string) => string;
  detected?: boolean;
  binaryPath?: string;
}

const agents: AgentInfo[] = [
  { name: 'claude-code', displayName: 'Claude Code', binary: 'claude',
    resumeCommand: (id) => `claude --resume ${id}` },
  { name: 'codex', displayName: 'Codex', binary: 'codex',
    resumeCommand: (id) => `codex resume ${id}` },
  { name: 'opencode', displayName: 'OpenCode', binary: 'opencode',
    resumeCommand: (id) => `opencode --session ${id}` },
  { name: 'pi', displayName: 'Pi', binary: 'pi',
    resumeCommand: (id) => `pi --session ${id}` },
  { name: 'amp', displayName: 'Amp', binary: 'amp',
    resumeCommand: (id) => `amp threads continue ${id}` },
  { name: 'cursor-cli', displayName: 'Cursor CLI', binary: 'cursor-agent',
    resumeCommand: (id) => `cursor-agent --resume ${id}` },
  { name: 'gemini', displayName: 'Gemini', binary: 'gemini',
    resumeCommand: (id) => `gemini --resume ${id}` },
  { name: 'copilot', displayName: 'Copilot', binary: 'copilot',
    resumeCommand: (id) => `copilot --resume ${id}` },
  { name: 'aider', displayName: 'Aider', binary: 'aider',
    resumeCommand: (id) => `aider --resume ${id}` },
  { name: 'goose', displayName: 'Goose', binary: 'goose',
    resumeCommand: (id) => `goose session resume ${id}` },
  { name: 'cline', displayName: 'Cline', binary: 'cline',
    resumeCommand: (id) => `cline --resume ${id}` },
  { name: 'factory', displayName: 'Factory', binary: 'droid',
    resumeCommand: (id) => `droid --resume ${id}` },
];

export class AgentResumeManager {
  private detectedAgents: Map<string, AgentInfo> = new Map();
  private sessionMap: Map<string, { agent: string; sessionId: string; paneId: string; workingDir: string }> = new Map();
  private hooksDir: string;

  constructor() {
    this.hooksDir = path.join(os.homedir(), '.zmuxterm', 'hooks');
  }

  async detectAgents(): Promise<AgentInfo[]> {
    const results: AgentInfo[] = [];
    for (const agent of agents) {
      try {
        const binName = process.platform === 'win32' ? `${agent.binary}.exe` : agent.binary;
        const { stdout } = await execAsync(`where ${binName} 2>nul || which ${agent.binary} 2>/dev/null`, { timeout: 3000 });
        const binaryPath = stdout.trim().split('\n')[0];
        if (binaryPath) {
          const info = { ...agent, detected: true, binaryPath };
          this.detectedAgents.set(agent.name, info);
          results.push(info);
        } else {
          results.push({ ...agent, detected: false });
        }
      } catch {
        results.push({ ...agent, detected: false });
      }
    }
    return results;
  }

  registerSession(paneId: string, agent: string, sessionId: string, workingDir: string): void {
    this.sessionMap.set(paneId, { agent, sessionId, paneId, workingDir });
  }

  getResumeCommand(paneId: string): string | null {
    const session = this.sessionMap.get(paneId);
    if (!session) return null;
    const agent = this.detectedAgents.get(session.agent);
    if (!agent) return null;
    return agent.resumeCommand(session.sessionId);
  }

  getSessionMap(): Array<{ agent: string; sessionId: string; paneId: string; workingDir: string }> {
    return Array.from(this.sessionMap.values());
  }

  async installHooks(): Promise<void> {
    if (!fs.existsSync(this.hooksDir)) {
      fs.mkdirSync(this.hooksDir, { recursive: true });
    }

    const detected = await this.detectAgents();
    for (const agent of detected) {
      if (!agent.detected) continue;
      const hookPath = path.join(this.hooksDir, `${agent.name}.bat`);
      const hookContent = `@echo off\r\nREM z-mux hook for ${agent.displayName}\r\nzmux notify -t "${agent.displayName} Waiting" -b "Input needed" --type agent-waiting\r\n`;
      fs.writeFileSync(hookPath, hookContent);
    }
  }

  getDetectedAgents(): AgentInfo[] {
    return Array.from(this.detectedAgents.values());
  }
}
