import * as fs from 'fs';
import * as path from 'path';

export interface DockControl {
  id: string;
  title: string;
  command: string;
  cwd?: string;
  height?: number;
  env?: Record<string, string>;
}

export interface DockConfig {
  controls: DockControl[];
}

export class DockManager {
  private controls: Map<string, DockControl> = new Map();

  loadConfig(configPath: string): void {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const cleaned = raw.replace(/\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
        const config: DockConfig = JSON.parse(cleaned);
        this.controls.clear();
        for (const control of config.controls || []) {
          this.controls.set(control.id, control);
        }
      }
    } catch (err) {
      console.warn(`Failed to load dock config: ${configPath}`, err);
    }
  }

  loadProjectConfig(projectDir: string): void {
    this.loadConfig(path.join(projectDir, '.zmux', 'dock.json'));
  }

  loadGlobalConfig(): void {
    const configDir = path.join(require('os').homedir(), '.config', 'zmux');
    this.loadConfig(path.join(configDir, 'dock.json'));
  }

  getControls(): DockControl[] {
    return Array.from(this.controls.values());
  }

  getControl(id: string): DockControl | undefined {
    return this.controls.get(id);
  }
}
