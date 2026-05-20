import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitInfo {
  branch: string;
  prNumber?: string;
  prStatus?: 'open' | 'merged' | 'closed';
  isDirty: boolean;
  ahead: number;
  behind: number;
  workingDir: string;
}

export async function getGitInfo(cwd: string): Promise<GitInfo | null> {
  try {
    const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd, timeout: 3000 });
    const { stdout: status } = await execAsync('git status --porcelain', { cwd, timeout: 3000 });
    let ahead = 0, behind = 0;
    try {
      const { stdout: revList } = await execAsync('git rev-list --left-right --count HEAD...@{upstream}', { cwd, timeout: 3000 });
      [ahead, behind] = revList.trim().split('\t').map(Number);
    } catch {}

    let prNumber: string | undefined;
    let prStatus: 'open' | 'merged' | 'closed' | undefined;
    try {
      const { stdout: prInfo } = await execAsync(
        `gh pr list --head ${branch.trim()} --json number,state --limit 1`,
        { cwd, timeout: 5000 }
      );
      const prs = JSON.parse(prInfo);
      if (prs.length > 0) {
        prNumber = `#${prs[0].number}`;
        prStatus = prs[0].state === 'OPEN' ? 'open' : prs[0].state === 'MERGED' ? 'merged' : 'closed';
      }
    } catch {}

    return { branch: branch.trim(), prNumber, prStatus, isDirty: status.trim().length > 0, ahead, behind, workingDir: cwd };
  } catch {
    return null;
  }
}

export async function getListeningPorts(): Promise<number[]> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('netstat -ano | findstr LISTENING', { timeout: 3000 });
      const ports = new Set<number>();
      for (const line of stdout.split('\n')) {
        const match = line.match(/:(\d+)\s/);
        if (match) {
          const port = parseInt(match[1], 10);
          if (port > 1024 && port < 65536) ports.add(port);
        }
      }
      return Array.from(ports).sort((a, b) => a - b).slice(0, 10);
    }
    return [];
  } catch { return []; }
}
