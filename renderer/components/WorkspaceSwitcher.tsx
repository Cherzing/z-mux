import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/app-store';

export const WorkspaceSwitcher: React.FC = () => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { workspaces, setActiveWorkspaceId } = useAppStore();

  const filtered = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelected(0); }, [query]);

  const handleClose = () => {
    useAppStore.getState().setCommandPaletteOpen(false);
  };

  const handleSelect = (id: string) => {
    setActiveWorkspaceId(id);
    handleClose();
  };

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selected]) handleSelect(filtered[selected].id); }
    else if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
  }, [filtered, selected]);

  return (
    <div className="command-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="command-palette">
        <input ref={inputRef} className="command-palette-input" placeholder="Go to workspace..."
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKey} />
        <div className="command-palette-list">
          {filtered.map((ws, i) => {
            const activeTab = ws.tabs.find((t) => t.id === ws.activeTabId);
            const pane = activeTab?.panes[0];
            return (
              <div key={ws.id} className={`command-palette-item ${i === selected ? 'selected' : ''}`}
                onClick={() => handleSelect(ws.id)} onMouseEnter={() => setSelected(i)}>
                <span className="command-palette-item-icon" style={{
                  width: 8, height: 8, borderRadius: '50%', background: ws.color || 'var(--accent)',
                  display: 'inline-block', marginRight: 8, flexShrink: 0
                }} />
                <span className="command-palette-item-label">{ws.name}</span>
                <span className="command-palette-item-shortcut" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {pane?.git?.branch || pane?.workingDir?.split('\\').pop() || ''}
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No workspaces</div>}
        </div>
      </div>
    </div>
  );
};
