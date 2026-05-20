#!/usr/bin/env node

import { Command } from 'commander';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';

const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\z-mux'
  : path.join(os.tmpdir(), 'z-mux.sock');

interface SocketResponse { id?: string; ok: boolean; result?: any; error?: string; }

function sendCommand(command: string, args?: Record<string, any>): Promise<SocketResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH, () => {
      socket.write(JSON.stringify({ command, args, id: Date.now().toString() }) + '\n');
    });
    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try { const r = JSON.parse(line.trim()); socket.end(); resolve(r); return; } catch {}
        }
      }
      buffer = lines[lines.length - 1] || '';
    });
    socket.on('error', (err) => reject(new Error(`Cannot connect to z-mux. Is it running?\n${err.message}`)));
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('Connection timed out')); });
  });
}

const program = new Command();
program.name('zmux').description('z-mux - Windows terminal multiplexer for AI coding agents').version('0.1.0');

// ── Workspaces ──
program.command('list-workspaces').alias('ls').description('List all workspaces')
  .action(async () => {
    const res = await sendCommand('list-workspaces');
    if (res.ok) { console.log('Workspaces:'); res.result.forEach((ws: any) => console.log(`  ${ws.id}  ${ws.name}  (${ws.tabCount} tabs)`)); }
    else { console.error('Error:', res.error); process.exit(1); }
  });

program.command('create-workspace').alias('new').description('Create a new workspace').argument('[name]')
  .action(async (name?: string) => {
    const res = await sendCommand('create-workspace', { name });
    if (res.ok) console.log(`Created workspace: ${res.result.id}`);
    else { console.error('Error:', res.error); process.exit(1); }
  });

program.command('select-workspace').alias('select').description('Select a workspace').argument('<id>')
  .action(async (id: string) => {
    await sendCommand('select-workspace', { id });
    console.log(`Selected workspace: ${id}`);
  });

program.command('close-workspace').alias('close').description('Close a workspace').argument('<id>')
  .action(async (id: string) => {
    await sendCommand('close-workspace', { id });
    console.log(`Closed workspace: ${id}`);
  });

// ── Surfaces ──
program.command('list-surfaces').alias('ps').description('List surfaces in active workspace')
  .action(async () => {
    const res = await sendCommand('list-surfaces');
    if (res.ok) { console.log('Surfaces:'); res.result.forEach((s: any) => console.log(`  ${s.id}  ${s.type}  ${s.title}`)); }
    else { console.error('Error:', res.error); process.exit(1); }
  });

program.command('create-surface').description('Create a new surface/tab')
  .option('-t, --type <type>', 'Surface type (terminal|browser)', 'terminal')
  .option('-w, --workspace <id>', 'Workspace ID')
  .action(async (opts) => {
    const res = await sendCommand('create-surface', { type: opts.type, workspaceId: opts.workspace });
    if (res.ok) console.log(`Created surface: ${res.result.id}`);
    else { console.error('Error:', res.error); process.exit(1); }
  });

program.command('split').description('Split a surface').argument('<surfaceId>')
  .option('-d, --direction <dir>', 'Split direction (vertical|horizontal)', 'vertical')
  .action(async (surfaceId: string, opts) => {
    const cmd = opts.direction === 'horizontal' ? 'surface:splitDown' : 'surface:splitRight';
    const res = await sendCommand('split', { surfaceId, direction: opts.direction });
    if (res.ok) console.log(`Split surface. New pane: ${res.result.id}`);
    else { console.error('Error:', res.error); process.exit(1); }
  });

program.command('send').description('Send text to a surface').argument('<surfaceId>').argument('<text>')
  .action(async (surfaceId: string, text: string) => {
    await sendCommand('send', { surfaceId, text });
  });

// ── Notifications ──
program.command('notify').description('Send a notification')
  .requiredOption('-t, --title <title>', 'Notification title')
  .option('-b, --body <body>', 'Notification body', '')
  .option('-s, --subtitle <subtitle>', 'Notification subtitle', '')
  .option('--type <type>', 'Notification type', 'info')
  .option('--surface <id>', 'Surface ID')
  .option('--workspace <id>', 'Workspace ID')
  .action(async (opts) => {
    await sendCommand('notify', { title: opts.title, body: opts.body, subtitle: opts.subtitle, type: opts.type, surfaceId: opts.surface, workspaceId: opts.workspace });
    console.log('Notification sent');
  });

program.command('list-notifications').alias('notif').description('List all notifications')
  .action(async () => {
    const res = await sendCommand('list-notifications');
    if (res.ok) {
      console.log('Notifications:');
      res.result.forEach((n: any) => {
        const read = n.read ? ' ' : '?';
        const time = new Date(n.timestamp).toLocaleTimeString();
        console.log(`  ${read} [${time}] ${n.title}: ${n.body}`);
      });
    }
  });

program.command('set-status').description('Set agent status').argument('<name>').argument('<status>')
  .action(async (name: string, status: string) => {
    await sendCommand('notify', { title: `${name}: ${status}`, body: '', type: 'agent-waiting' });
    console.log(`Status set: ${name} = ${status}`);
  });

program.command('clear-status').description('Clear agent status').argument('<name>')
  .action(async (name: string) => {
    console.log(`Status cleared: ${name}`);
  });

// ── SSH ──
const sshCmd = program.command('ssh').description('Create an SSH workspace');
sshCmd.argument('<target>', 'SSH target (user@host)')
  .option('-p, --port <port>', 'SSH port', '22')
  .option('-i, --identity <path>', 'SSH key path')
  .option('-n, --name <name>', 'Workspace name')
  .option('--no-focus', 'Don\'t switch to the new workspace')
  .action(async (target: string, opts) => {
    const res = await sendCommand('ssh', { target, port: opts.port, key: opts.identity, name: opts.name });
    if (res.ok) console.log(`SSH workspace created: ${res.result?.id || 'connected'}`);
    else { console.error('Error:', res.error); process.exit(1); }
  });

// ── Hooks ──
const hooksCmd = program.command('hooks').description('Manage agent hooks');
hooksCmd.command('setup').description('Install hooks for supported agents')
  .option('--agent <name>', 'Specific agent to setup')
  .action(async (opts) => {
    const res = await sendCommand('hooks:setup', { agent: opts.agent });
    if (res.ok) console.log('Hooks setup complete');
    else { console.error('Error:', res.error); process.exit(1); }
  });

// ── Browser ──
const browserCmd = program.command('browser').description('Browser automation');
const browserSurfaceOpt = (cmd: any) => cmd.option('-s, --surface <id>', 'Browser surface ID');

browserCmd.command('open').description('Open URL in browser pane').argument('[url]')
  .option('-w, --workspace <id>', 'Workspace ID')
  .action(async (url?: string, opts?: any) => {
    const res = await sendCommand('browser:open', { url: url || 'about:blank', workspaceId: opts?.workspace });
    if (res.ok) console.log(`Browser pane: ${res.result?.id}`);
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserCmd.command('open-split').description('Open browser in split pane').argument('[url]')
  .option('-d, --direction <dir>', 'Split direction', 'vertical')
  .action(async (url?: string) => {
    const res = await sendCommand('browser:open', { url: url || 'about:blank' });
    if (res.ok) console.log(`Browser pane: ${res.result?.id}`);
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('navigate').description('Navigate to URL').argument('<url>'))
  .action(async (url: string, opts) => {
    const res = await sendCommand('browser:navigate', { surfaceId: opts.surface, url });
    if (res.ok) console.log(`Navigated: ${url}`);
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('snapshot').description('Get accessibility tree snapshot'))
  .option('--interactive', 'Interactive mode')
  .action(async (opts) => {
    const res = await sendCommand('browser:snapshot', { surfaceId: opts.surface, interactive: opts.interactive });
    if (res.ok) console.log(JSON.stringify(res.result, null, 2));
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('click').description('Click an element').argument('<selector>'))
  .action(async (selector: string, opts) => {
    const res = await sendCommand('browser:click', { surfaceId: opts.surface, selector });
    if (res.ok) console.log('Clicked');
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('fill').description('Fill form field').argument('<selector>').argument('<value>'))
  .action(async (selector: string, value: string, opts) => {
    const res = await sendCommand('browser:fill', { surfaceId: opts.surface, selector, value });
    if (res.ok) console.log('Filled');
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('type').description('Type text into element').argument('<selector>').argument('<text>'))
  .action(async (selector: string, text: string, opts) => {
    const res = await sendCommand('browser:type', { surfaceId: opts.surface, selector, text });
    if (res.ok) console.log('Typed');
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('eval').description('Evaluate JavaScript').argument('<expression>'))
  .action(async (expression: string, opts) => {
    const res = await sendCommand('browser:eval', { surfaceId: opts.surface, expression });
    if (res.ok) console.log(JSON.stringify(res.result, null, 2));
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('get').description('Get page property (title/url/text/html)').argument('<property>'))
  .action(async (property: string, opts) => {
    const res = await sendCommand('browser:get', { surfaceId: opts.surface, property });
    if (res.ok) console.log(res.result);
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('screenshot').description('Take screenshot'))
  .action(async (opts) => {
    const res = await sendCommand('browser:screenshot', { surfaceId: opts.surface });
    if (res.ok) { if (res.result) console.log(res.result); else console.log('Screenshot taken'); }
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('find').description('Find elements by selector').argument('<selector>'))
  .action(async (selector: string, opts) => {
    const res = await sendCommand('browser:find', { surfaceId: opts.surface, selector });
    if (res.ok) console.log(JSON.stringify(res.result, null, 2));
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('wait').description('Wait for element/text/URL'))
  .option('--selector <sel>', 'Wait for selector')
  .option('--text <text>', 'Wait for text')
  .option('--url <url>', 'Wait for URL')
  .option('--timeout <ms>', 'Timeout in ms', '5000')
  .action(async (opts) => {
    const res = await sendCommand('browser:wait', { surfaceId: opts.surface, selector: opts.selector, text: opts.text, url: opts.url, timeout: parseInt(opts.timeout) });
    if (res.ok) console.log('Condition met');
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('press').description('Press a key').argument('<key>'))
  .action(async (key: string, opts) => {
    const res = await sendCommand('browser:press', { surfaceId: opts.surface, key });
    if (res.ok) console.log('Pressed');
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('select').description('Select option').argument('<selector>').argument('<values...>'))
  .action(async (selector: string, values: string[], opts) => {
    const res = await sendCommand('browser:select', { surfaceId: opts.surface, selector, values });
    if (res.ok) console.log('Selected');
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('scroll').description('Scroll page or element'))
  .option('--selector <sel>', 'Element selector')
  .option('--direction <dir>', 'Direction (up/down/left/right)', 'down')
  .action(async (opts) => {
    const res = await sendCommand('browser:scroll', { surfaceId: opts.surface, selector: opts.selector, direction: opts.direction });
    if (res.ok) console.log('Scrolled');
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('cookies').description('Manage cookies'))
  .option('--action <act>', 'Action (get/set/clear)', 'get')
  .option('--data <cookie>', 'Cookie string for set')
  .action(async (opts) => {
    const res = await sendCommand('browser:cookies', { surfaceId: opts.surface, action: opts.action, data: opts.data });
    if (res.ok) { if (res.result) console.log(res.result); else console.log('Done'); }
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('storage').description('Manage localStorage/sessionStorage'))
  .option('--action <act>', 'Action (get/clear)', 'get')
  .action(async (opts) => {
    const res = await sendCommand('browser:storage', { surfaceId: opts.surface, action: opts.action });
    if (res.ok) console.log(JSON.stringify(res.result, null, 2));
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('highlight').description('Highlight element').argument('<selector>'))
  .action(async (selector: string, opts) => {
    const res = await sendCommand('browser:highlight', { surfaceId: opts.surface, selector });
    if (res.ok) console.log('Highlighted');
    else { console.error('Error:', res.error); process.exit(1); }
  });

browserSurfaceOpt(browserCmd.command('is').description('Check element state').argument('<selector>').argument('<check>'))
  .action(async (selector: string, check: string, opts) => {
    const res = await sendCommand('browser:is', { surfaceId: opts.surface, selector, check });
    if (res.ok) console.log(res.result);
    else { console.error('Error:', res.error); process.exit(1); }
  });

// ── Session ──
program.command('restore-session').description('Restore previous session')
  .action(async () => {
    const res = await sendCommand('session:restore');
    if (res.ok) console.log('Session restored');
    else { console.error('Error:', res.error); process.exit(1); }
  });

// ── Config ──
program.command('reload-config').description('Reload configuration')
  .action(async () => {
    await sendCommand('reload-config');
    console.log('Configuration reloaded');
  });

// ── Identify ──
program.command('identify').description('Identify current surface/workspace')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const res = await sendCommand('identify');
    if (res.ok) {
      if (opts.json) console.log(JSON.stringify(res.result, null, 2));
      else console.log(`Workspace: ${res.result.workspace}\nSurface: ${res.result.surface}`);
    }
  });

program.command('current-workspace').description('Current workspace info')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const res = await sendCommand('current-workspace');
    if (res.ok) {
      if (opts.json) console.log(JSON.stringify(res.result, null, 2));
      else console.log(`Workspace: ${res.result.name} (${res.result.id})`);
    }
  });

// ── Focus ──
program.command('focus').description('Focus a surface').argument('<surfaceId>')
  .action(async (surfaceId: string) => {
    await sendCommand('focus', { surfaceId });
  });

// ── Feed ──
const feedCmd = program.command('feed').description('Feed bridge for agent events');

feedCmd.command('log').description('Show recent feed events')
  .option('-n, --limit <n>', 'Number of events', '20')
  .action(async (opts) => {
    const res = await sendCommand('feed:getEventLog', { limit: parseInt(opts.limit) });
    if (res.ok) {
      for (const event of res.result) {
        const time = new Date(event.timestamp).toLocaleTimeString();
        console.log(`[${time}] ${event.type} (${event.source}) ${event.surfaceId}`);
        if (event.payload?.message) console.log(`  ${event.payload.message}`);
      }
    }
  });

feedCmd.command('emit').description('Emit a custom feed event')
  .requiredOption('-t, --type <type>', 'Event type')
  .option('-s, --source <source>', 'Event source', 'cli')
  .option('-p, --payload <json>', 'Event payload (JSON)', '{}')
  .action(async (opts) => {
    const payload = JSON.parse(opts.payload);
    await sendCommand('feed:emitEvent', { type: opts.type, source: opts.source, surfaceId: '', workspaceId: '', payload });
    console.log('Event emitted');
  });

feedCmd.command('hooks').description('List registered feed hooks')
  .action(async () => {
    const res = await sendCommand('feed:getHooks');
    if (res.ok) {
      console.log('Feed hooks:');
      for (const hook of res.result) {
        console.log(`  ${hook.id} (${hook.name}) events=${hook.eventTypes.join(',')} priority=${hook.priority} enabled=${hook.enabled}`);
      }
    }
  });

// ── Agent ──
const agentCmd = program.command('agent').description('Agent integration');

agentCmd.command('detect').description('Detect installed coding agents')
  .action(async () => {
    const res = await sendCommand('agent:getAll');
    if (res.ok) {
      console.log('Detected agents:');
      for (const agent of res.result) {
        const status = agent.detected ? '✓' : '✗';
        console.log(`  ${status} ${agent.displayName} (${agent.binary})`);
      }
    }
  });

agentCmd.command('sessions').description('Show agent session map')
  .action(async () => {
    const res = await sendCommand('agent:getSessionMap');
    if (res.ok) {
      console.log('Agent sessions:');
      for (const session of res.result) {
        console.log(`  ${session.paneId} → ${session.agent} (${session.sessionId})`);
      }
      if (res.result.length === 0) console.log('  No active sessions');
    }
  });

program.parse();
