import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/app-store';

interface Command { id: string; label: string; shortcut?: string; action: () => void; }

export const CommandPalette: React.FC = () => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCommandPaletteOpen, addPaneToWorkspace, removeWorkspace, addWorkspace, setActiveWorkspaceId } = useAppStore();

  const commands: Command[] = [
    { id: 'ws.new', label: 'New Workspace', shortcut: 'Ctrl+Shift+N', action: async () => {
      const r = await (window as any).zmux.workspace.create();
      if (r) { addWorkspace(r.workspaceId, undefined, r.paneId); setActiveWorkspaceId(r.workspaceId); }
    }},
    { id: 'tab.new', label: 'New Tab', shortcut: 'Ctrl+T', action: async () => {
      const ws = useAppStore.getState().getActiveWorkspace();
      if (ws) { const pid = await (window as any).zmux.surface.create(ws.id); if (pid) addPaneToWorkspace(ws.id, pid); }
    }},
    { id: 'split.right', label: 'Split Right', shortcut: 'Ctrl+D', action: () => {
      const p = useAppStore.getState().getActivePane(); if (p) (window as any).zmux.surface.splitRight(p.id);
    }},
    { id: 'split.down', label: 'Split Down', shortcut: 'Ctrl+Shift+D', action: () => {
      const p = useAppStore.getState().getActivePane(); if (p) (window as any).zmux.surface.splitDown(p.id);
    }},
    { id: 'sidebar', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => useAppStore.getState().toggleSidebar() },
    { id: 'notif', label: 'Toggle Notifications', shortcut: 'Ctrl+Shift+E', action: () => useAppStore.getState().toggleRightSidebar() },
    { id: 'jump.notif', label: 'Jump to Latest Notification', shortcut: 'Ctrl+Shift+U', action: () => (window as any).zmux.notification.jumpToLatest() },
    { id: 'ws.next', label: 'Next Workspace', shortcut: 'Ctrl+Tab', action: () => (window as any).zmux.workspace.next() },
    { id: 'ws.prev', label: 'Previous Workspace', shortcut: 'Ctrl+Shift+Tab', action: () => (window as any).zmux.workspace.previous() },
  ];

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelected(0); }, [query]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[selected]?.action(); setCommandPaletteOpen(false); }
    else if (e.key === 'Escape') { e.preventDefault(); setCommandPaletteOpen(false); }
  }, [filtered, selected]);

  return (
    <div className="command-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCommandPaletteOpen(false); }}>
      <div className="command-palette">
        <input ref={inputRef} className="command-palette-input" placeholder="Type a command..."
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKey} />
        <div className="command-palette-list">
          {filtered.map((cmd, i) => (
            <div key={cmd.id} className={`command-palette-item ${i === selected ? 'selected' : ''}`}
              onClick={() => { cmd.action(); setCommandPaletteOpen(false); }} onMouseEnter={() => setSelected(i)}>
              <span className="command-palette-item-label">{cmd.label}</span>
              {cmd.shortcut && <span className="command-palette-item-shortcut">{cmd.shortcut}</span>}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No commands</div>}
        </div>
      </div>
    </div>
  );
};
