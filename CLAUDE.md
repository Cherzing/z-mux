# z-mux agent notes

## Project overview

z-mux is a Windows-native terminal multiplexer with vertical tabs and notifications for AI coding agents. It's built with Electron + React + xterm.js + node-pty (ConPTY).

## Tech stack

- **Runtime**: Electron 28+
- **Terminal**: xterm.js + node-pty (ConPTY on Windows)
- **UI**: React 18 + Zustand
- **Language**: TypeScript
- **Build**: Webpack + electron-builder
- **CLI**: Commander.js

## Local dev

```bash
npm install
npm run dev
```

This starts both the Electron main process and the webpack dev server for the renderer.

## Build

```bash
npm run build        # Build main + renderer
npm run dist         # Build Windows installer
```

## Project structure

- `src/` — Electron main process (Node.js)
- `renderer/` — React UI (runs in browser context)
- `packages/cli/` — CLI tool for scripting
- `assets/` — Icons and resources

## Key files

- `src/main.ts` — App entry, window creation, global shortcuts
- `src/window-manager.ts` — Workspace/pane state management
- `src/terminal-manager.ts` — ConPTY terminal lifecycle
- `src/notification-manager.ts` — Notification system (OSC 9/99/777)
- `src/socket-server.ts` — Named pipe API (`\\.\pipe\z-mux`)
- `src/session-manager.ts` — Session save/restore
- `renderer/components/` — React UI components
- `renderer/stores/app-store.ts` — Zustand state store

## Naming conventions

- Files: kebab-case (`window-manager.ts`)
- Classes: PascalCase (`WindowManager`)
- Interfaces: PascalCase (`PaneState`)
- CSS classes: kebab-case (`terminal-pane`)
- IDs: `type:timestamp` format (`workspace:1234567890`)

## Pitfalls

- node-pty requires native compilation. Ensure `windows-build-tools` are installed.
- Electron's context isolation is enabled. All IPC goes through `preload.ts`.
- The renderer process cannot access Node.js APIs directly.
- Named pipe path on Windows: `\\.\pipe\z-mux`
- Terminal theme must match xterm.js theme format (not CSS variables).

## Testing policy

Tests run via CI. Do not run E2E tests locally against the production build.

## Socket command protocol

Commands are JSON lines over named pipe:

```json
{"command": "list-workspaces", "id": "1"}
```

Responses:

```json
{"id": "1", "ok": true, "result": [...]}
{"id": "1", "ok": false, "error": "..."}
```

## Release

```bash
npm version patch    # or minor/major
git tag v0.1.1
git push --tags
npm run dist
```
