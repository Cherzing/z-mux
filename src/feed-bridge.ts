import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── Event Types ──

export interface FeedEvent {
  type: string;
  source: string;       // agent name (claude-code, codex, etc.)
  surfaceId: string;    // pane that emitted the event
  workspaceId: string;
  timestamp: number;
  payload: any;
}

export interface PermissionRequestEvent extends FeedEvent {
  type: 'permissionRequest';
  payload: {
    tool: string;
    description: string;
    input?: any;
    requestId: string;
  };
}

export interface PreToolUseEvent extends FeedEvent {
  type: 'preToolUse';
  payload: {
    tool: string;
    input?: any;
    requestId: string;
  };
}

export interface BeforeShellExecutionEvent extends FeedEvent {
  type: 'beforeShellExecution';
  payload: {
    command: string;
    cwd?: string;
    env?: Record<string, string>;
  };
}

export interface AgentStopEvent extends FeedEvent {
  type: 'agentStop';
  payload: {
    reason: 'waiting_for_input' | 'completed' | 'error' | 'permission_needed';
    message?: string;
    sessionId?: string;
  };
}

export interface AgentStartEvent extends FeedEvent {
  type: 'agentStart';
  payload: {
    sessionId?: string;
    agentVersion?: string;
  };
}

export interface SessionEndEvent extends FeedEvent {
  type: 'sessionEnd';
  payload: {
    sessionId?: string;
    exitCode?: number;
    reason?: string;
  };
}

export type AnyFeedEvent =
  | PermissionRequestEvent
  | PreToolUseEvent
  | BeforeShellExecutionEvent
  | AgentStopEvent
  | AgentStartEvent
  | SessionEndEvent
  | FeedEvent;

// ── Hook Definition ──

export interface FeedHook {
  id: string;
  name: string;
  eventTypes: string[];    // which events to listen for
  agentFilter?: string[];  // only these agents, or all if empty
  handler: (event: AnyFeedEvent) => Promise<AnyFeedEvent | null>;  // return null to stop propagation
  priority: number;        // lower = runs first
  enabled: boolean;
}

// ── Feed Bridge Manager ──

export class FeedBridge extends EventEmitter {
  private hooks: FeedHook[] = [];
  private eventLog: AnyFeedEvent[] = [];
  private maxLogSize = 1000;
  private hooksDir: string;

  constructor() {
    super();
    this.hooksDir = path.join(os.homedir(), '.zmuxterm', 'hooks');
    this.loadHooksFromConfig();
  }

  // ── Emit events from agents ──

  async emitEvent(event: Omit<FeedEvent, 'timestamp'>): Promise<void> {
    const fullEvent: AnyFeedEvent = {
      ...event,
      timestamp: Date.now()
    } as AnyFeedEvent;

    this.eventLog.push(fullEvent);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // Run through hooks in priority order
    let currentEvent: AnyFeedEvent | null = fullEvent;
    const sortedHooks = this.hooks
      .filter((h) => h.enabled)
      .filter((h) => h.eventTypes.length === 0 || h.eventTypes.includes(event.type))
      .filter((h) => !h.agentFilter || h.agentFilter.length === 0 || h.agentFilter.includes(event.source))
      .sort((a, b) => a.priority - b.priority);

    for (const hook of sortedHooks) {
      if (!currentEvent) break;
      try {
        currentEvent = await hook.handler(currentEvent);
      } catch (err) {
        console.error(`Feed hook ${hook.name} error:`, err);
      }
    }

    // Emit to listeners
    if (currentEvent) {
      this.emit('event', currentEvent);
      this.emit(currentEvent.type, currentEvent);
    }
  }

  // ── Convenience methods for common events ──

  async emitPermissionRequest(surfaceId: string, workspaceId: string, source: string, payload: PermissionRequestEvent['payload']): Promise<void> {
    await this.emitEvent({ type: 'permissionRequest', source, surfaceId, workspaceId, payload });
  }

  async emitPreToolUse(surfaceId: string, workspaceId: string, source: string, payload: PreToolUseEvent['payload']): Promise<void> {
    await this.emitEvent({ type: 'preToolUse', source, surfaceId, workspaceId, payload });
  }

  async emitBeforeShellExecution(surfaceId: string, workspaceId: string, source: string, payload: BeforeShellExecutionEvent['payload']): Promise<void> {
    await this.emitEvent({ type: 'beforeShellExecution', source, surfaceId, workspaceId, payload });
  }

  async emitAgentStop(surfaceId: string, workspaceId: string, source: string, payload: AgentStopEvent['payload']): Promise<void> {
    await this.emitEvent({ type: 'agentStop', source, surfaceId, workspaceId, payload });
  }

  async emitAgentStart(surfaceId: string, workspaceId: string, source: string, payload: AgentStartEvent['payload']): Promise<void> {
    await this.emitEvent({ type: 'agentStart', source, surfaceId, workspaceId, payload });
  }

  async emitSessionEnd(surfaceId: string, workspaceId: string, source: string, payload: SessionEndEvent['payload']): Promise<void> {
    await this.emitEvent({ type: 'sessionEnd', source, surfaceId, workspaceId, payload });
  }

  // ── Hook management ──

  registerHook(hook: FeedHook): void {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  unregisterHook(id: string): void {
    this.hooks = this.hooks.filter((h) => h.id !== id);
  }

  getHooks(): FeedHook[] {
    return [...this.hooks];
  }

  // ── Built-in hooks ──

  installBuiltinHooks(): void {
    // Notification hook: convert agentStop events to z-mux notifications
    this.registerHook({
      id: 'builtin:notification',
      name: 'Agent Notification',
      eventTypes: ['agentStop'],
      agentFilter: [],
      priority: 100,
      enabled: true,
      handler: async (event) => {
        if (event.type === 'agentStop' && event.payload.reason === 'waiting_for_input') {
          // This will be picked up by the notification system
          return event;
        }
        return event;
      }
    });

    // Permission request hook: show permission dialog
    this.registerHook({
      id: 'builtin:permission',
      name: 'Permission Handler',
      eventTypes: ['permissionRequest'],
      agentFilter: [],
      priority: 50,
      enabled: true,
      handler: async (event) => {
        // Permission requests are forwarded to the UI
        return event;
      }
    });

    // Shell execution logger
    this.registerHook({
      id: 'builtin:shell-logger',
      name: 'Shell Logger',
      eventTypes: ['beforeShellExecution'],
      agentFilter: [],
      priority: 200,
      enabled: true,
      handler: async (event) => {
        return event;
      }
    });
  }

  // ── OSC sequence parsing for agent events ──

  parseAgentOSC(surfaceId: string, workspaceId: string, data: string): void {
    // Parse zmux-specific OSC sequences for agent events
    // Format: \x1b]99;zmux;<eventType>;<jsonPayload>\x1b\\
    const zmuxMatch = data.match(/\x1b\]99;zmux;(\w+);(.+?)\x1b\\/);
    if (zmuxMatch) {
      const eventType = zmuxMatch[1];
      try {
        const payload = JSON.parse(zmuxMatch[2]);
        this.emitEvent({
          type: eventType,
          source: payload.agent || 'unknown',
          surfaceId,
          workspaceId,
          payload
        });
      } catch {}
    }

    // Parse Claude Code specific sequences
    // Claude Code emits: \x1b]9;claude-code;<event>\x1b\\
    const claudeMatch = data.match(/\x1b\]9;claude-code;(.+?)\x1b\\/);
    if (claudeMatch) {
      try {
        const payload = JSON.parse(claudeMatch[1]);
        this.emitEvent({
          type: payload.event || 'unknown',
          source: 'claude-code',
          surfaceId,
          workspaceId,
          payload
        });
      } catch {}
    }

    // Parse Codex specific sequences
    const codexMatch = data.match(/\x1b\]9;codex;(.+?)\x1b\\/);
    if (codexMatch) {
      try {
        const payload = JSON.parse(codexMatch[1]);
        this.emitEvent({
          type: payload.event || 'unknown',
          source: 'codex',
          surfaceId,
          workspaceId,
          payload
        });
      } catch {}
    }
  }

  // ── Load hooks from config ──

  private loadHooksFromConfig(): void {
    try {
      const configDir = path.join(os.homedir(), '.config', 'zmux');
      const configPath = path.join(configDir, 'zmux.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const cleaned = raw.replace(/\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
        const config = JSON.parse(cleaned);
        if (config.notifications?.hooks) {
          for (const hook of config.notifications.hooks) {
            this.registerHook({
              id: hook.id || `config:${hook.name}`,
              name: hook.name,
              eventTypes: hook.events || [],
              agentFilter: hook.agents || [],
              priority: hook.priority || 100,
              enabled: hook.enabled !== false,
              handler: async (event) => {
                // Run shell hook
                if (hook.command) {
                  try {
                    const env = {
                      ...process.env,
                      ZMUX_EVENT_TYPE: event.type,
                      ZMUX_EVENT_SOURCE: event.source,
                      ZMUX_EVENT_SURFACE: event.surfaceId,
                      ZMUX_EVENT_WORKSPACE: event.workspaceId,
                      ZMUX_EVENT_PAYLOAD: JSON.stringify(event.payload)
                    };
                    await execAsync(hook.command, { env, timeout: 5000 });
                  } catch {}
                }
                return event;
              }
            });
          }
        }
      }
    } catch {}
  }

  // ── Event log ──

  getEventLog(limit = 50): AnyFeedEvent[] {
    return this.eventLog.slice(-limit);
  }

  clearEventLog(): void {
    this.eventLog = [];
  }
}
