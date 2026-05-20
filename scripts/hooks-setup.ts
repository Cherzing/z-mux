#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ZMUX_HOME = path.join(os.homedir(), '.zmuxterm');
const HOOKS_DIR = path.join(ZMUX_HOME, 'hooks');

interface AgentConfig {
  name: string;
  hookScript: string;
  detectPaths: string[];
}

const agents: AgentConfig[] = [
  {
    name: 'claude-code',
    hookScript: `#!/bin/bash
# z-mux hook for Claude Code
zmux notify -t "Claude Waiting" -b "Input needed in $(pwd)" --type agent-waiting
`,
    detectPaths: [
      path.join(os.homedir(), '.claude', 'bin', 'claude'),
      '/usr/local/bin/claude'
    ]
  },
  {
    name: 'codex',
    hookScript: `#!/bin/bash
# z-mux hook for Codex
zmux notify -t "Codex Waiting" -b "Input needed in $(pwd)" --type agent-waiting
`,
    detectPaths: [
      path.join(os.homedir(), '.codex', 'bin', 'codex'),
      '/usr/local/bin/codex'
    ]
  },
  {
    name: 'opencode',
    hookScript: `#!/bin/bash
# z-mux hook for OpenCode
zmux notify -t "OpenCode Waiting" -b "Input needed in $(pwd)" --type agent-waiting
`,
    detectPaths: [
      path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
      '/usr/local/bin/opencode'
    ]
  }
];

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function setupHooks() {
  ensureDir(ZMUX_HOME);
  ensureDir(HOOKS_DIR);

  console.log('Setting up z-mux hooks...\n');

  for (const agent of agents) {
    const hookPath = path.join(HOOKS_DIR, `${agent.name}.sh`);

    fs.writeFileSync(hookPath, agent.hookScript, { mode: 0o755 });
    console.log(`  Created hook: ${hookPath}`);

    // Check if agent is installed
    const found = agent.detectPaths.some(p => fs.existsSync(p));
    if (found) {
      console.log(`  ✓ ${agent.name} detected`);
    } else {
      console.log(`  - ${agent.name} not found (hook created anyway)`);
    }
  }

  console.log('\nHooks setup complete!');
  console.log(`Hook directory: ${HOOKS_DIR}`);
  console.log('\nTo use hooks, add the hook scripts to your agent configuration.');
}

setupHooks();
