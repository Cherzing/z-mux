import React, { useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/app-store';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { PaneContainer } from './PaneContainer';
import { NotificationPanel } from './NotificationPanel';
import { CommandPalette } from './CommandPalette';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { StatusBar } from './StatusBar';
import { Settings } from './Settings';

export const App: React.FC = () => {
  const store = useAppStore();
  const {
    commandPaletteOpen, workspaceSwitcherOpen, settingsOpen,
    setCommandPaletteOpen, setWorkspaceSwitcherOpen, setSettingsOpen,
    toggleSidebar, toggleRightSidebar,
    setWindowMaximized, addWorkspace, setActiveWorkspaceId,
    addPaneToWorkspace, removePane, removeWorkspace,
    setNotifications, addNotification, updatePaneGit,
    setPaneNotification, setFindBarVisible, setCopyMode
  } = store;

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const api = (window as any).zmux;

    // ── Window state ──
    api.window.onMaximized((v: boolean) => setWindowMaximized(v));

    // ── Terminal data from main process → CustomEvent → TerminalPane ──
    api.surface.onData((id: string, data: string) => {
      window.dispatchEvent(new CustomEvent('terminal:data', { detail: { id, data } }));
    });
    api.surface.onExit((id: string, code: number) => {
      window.dispatchEvent(new CustomEvent('terminal:exit', { detail: { id, code } }));
    });
    api.surface.onTitleChanged((id: string, title: string) => {
      window.dispatchEvent(new CustomEvent('terminal:title', { detail: { id, title } }));
    });

    // ── Git info polling → update pane ──
    api.git.onInfo((info: any) => {
      updatePaneGit(info.paneId, info.git, info.ports);
    });

    // ── Notifications ──
    api.notification.onNew((n: any) => {
      addNotification(n);
      if (n.surfaceId) setPaneNotification(n.surfaceId, true);
    });
    api.notification.onStateChanged((s: any) => {
      setNotifications(s.notifications, s.unreadCount);
    });

    // ── Session restore from main process ──
    api.session.onRestore((session: any) => {
      if (!session?.workspaces) return;
      for (const ws of session.workspaces) {
        addWorkspace(ws.id, ws.name, ws.tabs?.[0]?.panes?.[0]?.id);
        if (ws.id === session.activeWorkspaceId) setActiveWorkspaceId(ws.id);
      }
    });

    // ── Global shortcut commands ──
    api.command.onExecute((command: string) => {
      const s = useAppStore.getState();
      switch (command) {
        case 'palette.open': setCommandPaletteOpen(true); break;
        case 'workspace.new': handleNewWorkspace(); break;
        case 'notification.jumpLatest': api.notification.jumpToLatest(); break;
        case 'sidebar.toggle': toggleSidebar(); break;
        case 'rightSidebar.toggle': toggleRightSidebar(); break;
        case 'notifications.toggle': toggleRightSidebar(); break;
        case 'browser.open': handleOpenBrowser(); break;
        case 'session.restore': api.session.restore(); break;
        case 'pane.zoom': {
          const pane = s.getActivePane();
          if (pane) api.surface.zoom(pane.id);
          break;
        }
      }
    });

    // ── Initial workspace from main process ──
    api.init.onReady((data: { workspaceId: string; paneId: string }) => {
      addWorkspace(data.workspaceId, 'Main', data.paneId);
      setActiveWorkspaceId(data.workspaceId);
    });
  }, []);

  const handleNewWorkspace = useCallback(async () => {
    const result = await (window as any).zmux.workspace.create();
    if (result) {
      addWorkspace(result.workspaceId, undefined, result.paneId);
      setActiveWorkspaceId(result.workspaceId);
    }
  }, []);

  const handleOpenBrowser = useCallback(async () => {
    const s = useAppStore.getState();
    const ws = s.getActiveWorkspace();
    if (ws) {
      const paneId = await (window as any).zmux.surface.create(ws.id, 'browser');
      if (paneId) addPaneToWorkspace(ws.id, paneId, 'browser');
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;
    const s = useAppStore.getState();

    // Command palette
    if (ctrl && shift && e.key === 'P') { e.preventDefault(); setCommandPaletteOpen(true); return; }
    // Workspace switcher
    if (ctrl && e.key === 'p' && !shift && !alt) { e.preventDefault(); setWorkspaceSwitcherOpen(true); return; }
    // New workspace
    if (ctrl && shift && e.key === 'N') { e.preventDefault(); handleNewWorkspace(); return; }
    // Close workspace
    if (ctrl && shift && e.key === 'W') {
      e.preventDefault();
      const ws = s.getActiveWorkspace();
      if (ws) {
        (window as any).zmux.workspace.close(ws.id);
        removeWorkspace(ws.id);
      }
      return;
    }
    // Sidebar toggles
    if (ctrl && e.key === 'b' && !shift && !alt) { e.preventDefault(); toggleSidebar(); return; }
    if (ctrl && alt && e.key === 'b') { e.preventDefault(); toggleRightSidebar(); return; }
    if (ctrl && shift && e.key === 'E') { e.preventDefault(); toggleRightSidebar(); return; }
    // Notifications
    if (ctrl && shift && e.key === 'U') { e.preventDefault(); (window as any).zmux.notification.jumpToLatest(); return; }
    if (ctrl && shift && e.key === 'I') { e.preventDefault(); toggleRightSidebar(); return; }
    if (alt && ctrl && e.key === 'u') {
      e.preventDefault();
      const n = s.notifications[0];
      if (n) (window as any).zmux.notification.toggleUnread(n.id);
      return;
    }
    // New tab
    if (ctrl && e.key === 't' && !shift && !alt) {
      e.preventDefault();
      const ws = s.getActiveWorkspace();
      if (ws) {
        (window as any).zmux.surface.create(ws.id).then((paneId: string) => {
          if (paneId) addPaneToWorkspace(ws.id, paneId);
        });
      }
      return;
    }
    // Close tab
    if (ctrl && e.key === 'w' && !shift && !alt) {
      e.preventDefault();
      const pane = s.getActivePane();
      if (pane) { (window as any).zmux.surface.close(pane.id); removePane(pane.id); }
      return;
    }
    // Next/prev surface
    if (ctrl && shift && e.key === ']') {
      e.preventDefault();
      const ws = s.getActiveWorkspace();
      if (ws && ws.tabs.length > 1) {
        const idx = ws.tabs.findIndex((t) => t.id === ws.activeTabId);
        const next = ws.tabs[(idx + 1) % ws.tabs.length];
        if (next) s.setActivePane(ws.id, next.id, next.activePaneId);
      }
      return;
    }
    if (ctrl && shift && e.key === '[') {
      e.preventDefault();
      const ws = s.getActiveWorkspace();
      if (ws && ws.tabs.length > 1) {
        const idx = ws.tabs.findIndex((t) => t.id === ws.activeTabId);
        const prev = ws.tabs[(idx - 1 + ws.tabs.length) % ws.tabs.length];
        if (prev) s.setActivePane(ws.id, prev.id, prev.activePaneId);
      }
      return;
    }
    // Close other tabs
    if (alt && ctrl && e.key === 't') {
      e.preventDefault();
      const ws = s.getActiveWorkspace();
      const tab = s.getActiveTab();
      if (ws && tab) {
        for (const t of ws.tabs) {
          if (t.id !== tab.id) {
            for (const p of t.panes) {
              (window as any).zmux.surface.close(p.id);
              s.removePane(p.id);
            }
          }
        }
      }
      return;
    }
    // Copy mode
    if (ctrl && shift && e.key === 'M') { e.preventDefault(); setCopyMode(!s.copyMode); return; }
    // Open folder
    if (ctrl && e.key === 'o' && !shift && !alt) {
      e.preventDefault();
      (window as any).zmux.dialog.openDirectory().then((dir: string | null) => {
        if (dir) {
          const ws = s.getActiveWorkspace();
          if (ws) {
            (window as any).zmux.surface.create(ws.id).then((paneId: string) => {
              if (paneId) s.addPaneToWorkspace(ws.id, paneId);
            });
          }
        }
      });
      return;
    }
    // Split right
    if (ctrl && e.key === 'd' && !shift && !alt) {
      e.preventDefault();
      const pane = s.getActivePane();
      if (pane) (window as any).zmux.surface.splitRight(pane.id);
      return;
    }
    // Split down
    if (ctrl && shift && e.key === 'D' && !alt) {
      e.preventDefault();
      const pane = s.getActivePane();
      if (pane) (window as any).zmux.surface.splitDown(pane.id);
      return;
    }
    // Browser split
    if (alt && ctrl && e.key === 'd') { e.preventDefault(); handleOpenBrowser(); return; }
    if (alt && shift && ctrl && e.key === 'D') { e.preventDefault(); handleOpenBrowser(); return; }
    // Focus navigation
    if (alt && ctrl && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const ws = s.getActiveWorkspace();
      const tab = s.getActiveTab();
      if (ws && tab && tab.panes.length > 1) {
        const idx = tab.panes.findIndex((p) => p.id === tab.activePaneId);
        const next = (e.key === 'ArrowRight' || e.key === 'ArrowDown')
          ? (idx + 1) % tab.panes.length
          : (idx - 1 + tab.panes.length) % tab.panes.length;
        const newPane = tab.panes[next];
        if (newPane) s.setActivePane(ws.id, tab.id, newPane.id);
      }
      return;
    }
    // Pane zoom
    if (ctrl && shift && e.key === 'Enter') {
      e.preventDefault();
      const pane = s.getActivePane();
      if (pane) (window as any).zmux.surface.zoom(pane.id);
      return;
    }
    // Browser
    if (ctrl && shift && e.key === 'L') { e.preventDefault(); handleOpenBrowser(); return; }
    // Find
    if (ctrl && e.key === 'f' && !shift) { e.preventDefault(); setFindBarVisible(true); return; }
    // Settings
    if (ctrl && e.key === ',' && !shift) { e.preventDefault(); setSettingsOpen(true); return; }
    // Session restore
    if (ctrl && shift && e.key === 'O') { e.preventDefault(); (window as any).zmux.session.restore(); return; }
    // Workspace switching: Ctrl+1-9
    if (ctrl && !shift && !alt && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      const ws = s.workspaces[idx];
      if (ws) setActiveWorkspaceId(ws.id);
      return;
    }
    // Workspace nav
    if (ctrl && e.key === 'Tab') {
      e.preventDefault();
      const ws = s.getActiveWorkspace();
      if (!ws) return;
      const idx = s.workspaces.findIndex((w) => w.id === ws.id);
      if (shift) {
        const prev = s.workspaces[(idx - 1 + s.workspaces.length) % s.workspaces.length];
        if (prev) setActiveWorkspaceId(prev.id);
      } else {
        const next = s.workspaces[(idx + 1) % s.workspaces.length];
        if (next) setActiveWorkspaceId(next.id);
      }
      return;
    }
    // Rename workspace
    if (ctrl && shift && e.key === 'R') {
      e.preventDefault();
      const ws = s.getActiveWorkspace();
      if (ws) {
        const name = window.prompt('Rename workspace:', ws.name);
        if (name) {
          (window as any).zmux.workspace.rename(ws.id, name);
          // Update local state
          useAppStore.setState({
            workspaces: s.workspaces.map((w) => w.id === ws.id ? { ...w, name } : w)
          });
        }
      }
      return;
    }
  }, [handleNewWorkspace, handleOpenBrowser]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <TitleBar />
      <div className="app-container">
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TabBar />
          <PaneContainer />
          <StatusBar />
        </div>
        <NotificationPanel />
      </div>
      {commandPaletteOpen && <CommandPalette />}
      {workspaceSwitcherOpen && <WorkspaceSwitcher />}
      {settingsOpen && <Settings />}
    </>
  );
};
