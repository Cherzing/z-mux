# z-mux

A Windows-native terminal with vertical tabs and notifications for AI coding agents.

z-mux is a terminal multiplexer inspired by [cmux](https://github.com/manaflow-ai/cmux), built specifically for Windows. It provides a native-feeling terminal experience with workspace management, split panes, notifications for AI coding agents, and a fully scriptable CLI.

## Features

- **Vertical + horizontal tabs** — Sidebar shows git branch, PR status, working directory, and listening ports
- **Notification rings** — Terminals get a blue ring when coding agents need your attention
- **Notification panel** — See all pending notifications, jump to the most recent unread
- **Split panes** — Split horizontally and vertically, navigate with keyboard shortcuts
- **Command palette** — Ctrl+Shift+P for quick access to all commands
- **Session restore** — Quit and relaunch with your layout intact
- **Scriptable** — CLI and named pipe API for automation
- **Native Windows** — Built with Electron + xterm.js + ConPTY for real terminal emulation
- **Customizable** — Settings for themes, fonts, keyboard shortcuts

## Install

### From source

```bash
# Prerequisites: Node.js 18+, npm
git clone https://github.com/your-username/z-mux.git
cd z-mux
npm install
npm run build
npm start
```

### Development

```bash
npm run dev
```

## Keyboard Shortcuts

### Workspaces

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+N | New workspace |
| Ctrl+Tab | Next workspace |
| Ctrl+Shift+Tab | Previous workspace |
| Ctrl+Shift+W | Close workspace |
| Ctrl+B | Toggle sidebar |

### Tabs & Panes

| Shortcut | Action |
|----------|--------|
| Ctrl+T | New tab |
| Ctrl+W | Close tab |
| Ctrl+D | Split right |
| Ctrl+Shift+D | Split down |
| Ctrl+Shift+L | Open browser in split |

### Notifications

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+U | Jump to latest unread |
| Ctrl+Shift+E | Toggle notification panel |

### General

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+P | Command palette |
| Ctrl+F | Find in terminal |
| Ctrl+Shift+C | Copy |
| Ctrl+Shift+V | Paste |

## CLI

z-mux includes a CLI for scripting and automation:

```bash
# List workspaces
zmux ls

# Create a new workspace
zmux new "My Project"

# List surfaces (tabs/panes)
zmux ps

# Create a new terminal tab
zmux create-surface

# Split a pane
zmux split <surfaceId> -d vertical

# Send a notification
zmux notify -t "Build Complete" -b "All tests passed" --type task-complete

# List notifications
zmux notif

# SSH workspace
zmux ssh user@remote-server
```

## Socket API

z-mux exposes a named pipe API on Windows (`\\.\pipe\z-mux`) for programmatic control:

```json
{"command": "list-workspaces", "id": "1"}
{"command": "create-workspace", "args": {"name": "Dev"}, "id": "2"}
{"command": "create-surface", "args": {"workspaceId": "workspace:1"}, "id": "3"}
{"command": "split", "args": {"surfaceId": "pane:1", "direction": "vertical"}, "id": "4"}
{"command": "notify", "args": {"title": "Agent Waiting", "body": "Claude needs input", "type": "agent-waiting"}, "id": "5"}
```

## Configuration

z-mux stores its configuration in `%APPDATA%\z-mux\`. Session data is saved automatically on exit and restored on launch.

### Settings file

```json
{
  "terminal": {
    "fontSize": 14,
    "fontFamily": "Cascadia Code, Consolas, monospace",
    "theme": "dark",
    "cursorStyle": "block",
    "cursorBlink": true,
    "scrollback": 10000
  },
  "appearance": {
    "sidebarWidth": 240,
    "showGitBranch": true,
    "showPRStatus": true,
    "showPorts": true,
    "accentColor": "#4c71f2"
  }
}
```

## Notification Hooks

Wire z-mux notifications into your AI coding agents:

### Claude Code

Add to your Claude Code hooks:

```bash
zmux notify -t "Claude Waiting" -b "Input needed" --type agent-waiting
```

### Generic OSC sequences

z-mux recognizes these terminal escape sequences:
- OSC 9: `\x1b]9;message\x1b\\`
- OSC 99: `\x1b]99;{"title":"...","body":"...","type":"..."}\x1b\\`
- OSC 777: `\x1b]777;message\x1b\\`

## Architecture

```
z-mux/
├── src/                    # Electron main process
│   ├── main.ts             # App entry point
│   ├── preload.ts          # Context bridge
│   ├── window-manager.ts   # Workspace/pane state
│   ├── terminal-manager.ts # ConPTY terminal management
│   ├── notification-manager.ts # Notification system
│   ├── socket-server.ts    # Named pipe API
│   ├── session-manager.ts  # Session save/restore
│   ├── git-info.ts         # Git branch & PR detection
│   └── ipc.ts              # IPC handlers
├── renderer/               # React UI
│   ├── components/         # UI components
│   ├── stores/             # Zustand state
│   └── styles/             # CSS
├── packages/
│   └── cli/                # CLI tool
└── assets/                 # Icons
```

## Comparison with cmux

| Feature | cmux (macOS) | z-mux (Windows) |
|---------|-------------|-----------------|
| Terminal backend | libghostty (GPU) | ConPTY + xterm.js |
| UI framework | Swift/AppKit | React/Electron |
| Sidebar with git info | Yes | Yes |
| Notification rings | Yes | Yes |
| Notification panel | Yes | Yes |
| Split panes | Yes | Yes |
| In-app browser | Yes | Planned |
| SSH workspaces | Yes | Yes |
| CLI & socket API | Yes | Yes |
| Session restore | Yes | Yes |
| Command palette | Yes | Yes |
| Custom commands | Yes | Planned |
| Auto-update | Sparkle | Planned |

## License

MIT
