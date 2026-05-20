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
  const {
    commandPaletteOpen, workspaceSwitcherOpen, settingsOpen,
    setCommandPaletteOpen, setWorkspaceSwitcherOpen, setSettingsOpen,
    toggleSidebar, toggleRightSidebar,
    setWindowMaximized, addWorkspace, setActiveWorkspaceId,
    addPaneToWorkspace, removePane,
    setNotifications, addNotification, updatePaneGit,
    setPaneNotification, setFindBarVisible
  } = useAppStore();

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const api = (window as any).zmux;

    api.window.onMaximized((v: boolean) => setWindowMaximized(v));

    api.surface.onData((id: string, data: string) => {
      window.dispatchEvent(new CustomEvent('terminal:data', { detail: { id, data } }));
    });
    api.surface.onExit((id: string, code: number) => {
      window.dispatchEvent(new CustomEvent('terminal:exit', { detail: { id, code } }));
    });
    api.surface.onTitleChanged((id: string, title: string) => {
      window.dispatchEvent(new CustomEvent('terminal:title', { detail: { id, title } }));
    });

    api.git.onInfo((info: any) => {
      updatePaneGit(info.paneId, info.git, info.ports);
    });

    api.notification.onNew((n: any) => {
      addNotification(n);
      if (n.surfaceId) setPaneNotification(n.surfaceId, true);
    });
    api.notification.onStateChanged((s: any) => setNotifications(s.notifications, s.unreadCount));

    api.settings.onChanged(() => {});

    api.command.onExecute((command: string) => {
      const store = useAppStore.getState();
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
          const pane = store.getActivePane();
          if (pane) api.surface.zoom(pane.id);
          break;
        }
      }
    });

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
    const store = useAppStore.getState();
    const ws = store.getActiveWorkspace();
    if (ws) {
      const paneId = await (window as any).zmux.surface.create(ws.id, 'browser');
      if (paneId) addPaneToWorkspace(ws.id, paneId, 'browser');
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;
    const store = useAppStore.getState();

    // Command palette
    if (ctrl && shift && e.key === 'P') { e.preventDefault(); setCommandPaletteOpen(true); return; }

    // Workspace switcher
    if (ctrl && e.key === 'p' && !shift && !alt) { e.preventDefault(); setWorkspaceSwitcherOpen(true); return; }

    // Workspaces
    if (ctrl && shift && e.key === 'N') { e.preventDefault(); handleNewWorkspace(); return; }
    if (ctrl && shift && e.key === 'W') {
      e.preventDefault();
      const ws = store.getActiveWorkspace();
      if (ws) { (window as any).zmux.workspace.close(ws.id); removePane(ws.tabs[0]?.panes[0]?.id); }
      return;
    }
    if (ctrl && e.key === 'b' && !shift && !alt) { e.preventDefault(); toggleSidebar(); return; }
    if (ctrl && alt && e.key === 'b') { e.preventDefault(); toggleRightSidebar(); return; }
    if (ctrl && shift && e.key === 'E') { e.preventDefault(); toggleRightSidebar(); return; }

    // Notifications
    if (ctrl && shift && e.key === 'U') { e.preventDefault(); (window as any).zmux.notification.jumpToLatest(); return; }
    if (ctrl && shift && e.key === 'I') { e.preventDefault(); toggleRightSidebar(); return; }
    if (alt && ctrl && e.key === 'u') { e.preventDefault(); const n = store.notifications[0]; if (n) (window as any).zmux.notification.toggleUnread(n.id); return; }
    if (ctrl && shift && e.key === 'H') { e.preventDefault(); /* flash pane */ return; }

    // Surfaces (tabs)
    if (ctrl && e.key === 't' && !shift && !alt) {
      e.preventDefault();
      const ws = store.getActiveWorkspace();
      if (ws) {
        (window as any).zmux.surface.create(ws.id).then((paneId: string) => {
          if (paneId) addPaneToWorkspace(ws.id, paneId);
        });
      }
      return;
    }
    if (ctrl && e.key === 'w' && !shift && !alt) {
      e.preventDefault();
      const pane = store.getActivePane();
      if (pane) { (window as any).zmux.surface.close(pane.id); removePane(pane.id); }
      return;
    }
    // Next/prev surface in current workspace
    if (ctrl && shift && e.key === ']') {
      e.preventDefault();
      const ws = store.getActiveWorkspace();
      if (ws && ws.tabs.length > 1) {
        const idx = ws.tabs.findIndex((t) => t.id === ws.activeTabId);
        const next = ws.tabs[(idx + 1) % ws.tabs.length];
        if (next) store.setActivePane(ws.id, next.id, next.activePaneId);
      }
      return;
    }
    if (ctrl && shift && e.key === '[') {
      e.preventDefault();
      const ws = store.getActiveWorkspace();
      if (ws && ws.tabs.length > 1) {
        const idx = ws.tabs.findIndex((t) => t.id === ws.activeTabId);
        const prev = ws.tabs[(idx - 1 + ws.tabs.length) % ws.tabs.length];
        if (prev) store.setActivePane(ws.id, prev.id, prev.activePaneId);
      }
      return;
    }

    // Close other tabs in pane
    if (alt && ctrl && e.key === 't') {
      e.preventDefault();
      const ws = store.getActiveWorkspace();
      const tab = store.getActiveTab();
      if (ws && tab) {
        for (const t of ws.tabs) {
          if (t.id !== tab.id) {
            for (const p of t.panes) {
              (window as any).zmux.surface.close(p.id);
              store.removePane(p.id);
            }
          }
        }
      }
      return;
    }

    // Copy mode
    if (ctrl && shift && e.key === 'M') {
      e.preventDefault();
      store.setCopyMode(!store.copyMode);
      return;
    }

    // Open folder
    if (ctrl && e.key === 'o' && !shift && !alt) {
      e.preventDefault();
      (window as any).zmux.dialog.openDirectory().then((dir: string | null) => {
        if (dir) {
          const ws = store.getActiveWorkspace();
          if (ws) {
            (window as any).zmux.surface.create(ws.id).then((paneId: string) => {
              if (paneId) store.addPaneToWorkspace(ws.id, paneId);
            });
          }
        }
      });
      return;
    }

    // Splits
    if (ctrl && e.key === 'd' && !shift && !alt) {
      e.preventDefault();
      const pane = store.getActivePane();
      if (pane) (window as any).zmux.surface.splitRight(pane.id);
      return;
    }
    if (ctrl && shift && e.key === 'D' && !alt) {
      e.preventDefault();
      const pane = store.getActivePane();
      if (pane) (window as any).zmux.surface.splitDown(pane.id);
      return;
    }
    if (alt && ctrl && e.key === 'd') {
      e.preventDefault();
      handleOpenBrowser();
      return;
    }
    if (alt && shift && ctrl && e.key === 'D') {
      e.preventDefault();
      handleOpenBrowser();
      return;
    }

    // Focus navigation (Alt+Ctrl+Arrow)
    if (alt && ctrl && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const ws = store.getActiveWorkspace();
      const tab = store.getActiveTab();
      if (ws && tab && tab.panes.length > 1) {
        const currentIdx = tab.panes.findIndex((p) => p.id === tab.activePaneId);
        let newIdx = currentIdx;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') newIdx = (currentIdx + 1) % tab.panes.length;
        else newIdx = (currentIdx - 1 + tab.panes.length) % tab.panes.length;
        const newPane = tab.panes[newIdx];
        if (newPane) store.setActivePane(ws.id, tab.id, newPane.id);
      }
      return;
    }

    // Pane zoom
    if (ctrl && shift && e.key === 'Enter') {
      e.preventDefault();
      const pane = store.getActivePane();
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
      const ws = store.workspaces[idx];
      if (ws) setActiveWorkspaceId(ws.id);
      return;
    }

    // Workspace nav: Ctrl+Tab / Ctrl+Shift+Tab
    if (ctrl && e.key === 'Tab') {
      e.preventDefault();
      if (shift) (window as any).zmux.workspace.previous();
      else (window as any).zmux.workspace.next();
      return;
    }

    // Rename: Ctrl+Shift+R
    if (ctrl && shift && e.key === 'R') {
      e.preventDefault();
      const ws = store.getActiveWorkspace();
      if (ws) {
        const name = prompt('Rename workspace:', ws.name);
        if (name) (window as any).zmux.workspace.rename(ws.id, name);
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
