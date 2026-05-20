import React, { useCallback, useRef, useState } from 'react';
import { useAppStore, LayoutNode, Pane, Tab } from '../stores/app-store';
import { TerminalPane } from './TerminalPane';
import { BrowserPane } from './BrowserPane';

export const PaneContainer: React.FC = () => {
  const { workspaces, activeWorkspaceId } = useAppStore();
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeTab = workspace?.tabs.find((t) => t.id === workspace.activeTabId);

  if (!activeTab || activeTab.panes.length === 0) {
    return (
      <div className="pane-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16, fontWeight: 300 }}>z-mux</div>
          <div style={{ fontSize: 14 }}>
            Press <kbd className="kbd">Ctrl+T</kbd> to open a new terminal
          </div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            <kbd className="kbd">Ctrl+Shift+P</kbd> command palette &middot;{' '}
            <kbd className="kbd">Ctrl+D</kbd> split right &middot;{' '}
            <kbd className="kbd">Ctrl+Shift+L</kbd> browser
          </div>
        </div>
      </div>
    );
  }

  // Check if any pane is zoomed
  const zoomedPane = activeTab.panes.find((p) => p.zoomed);

  return (
    <div className="pane-container">
      {zoomedPane ? (
        <LayoutRenderer layout={{ type: 'leaf', paneId: zoomedPane.id }} tab={activeTab} />
      ) : (
        <LayoutRenderer layout={activeTab.layout} tab={activeTab} />
      )}
    </div>
  );
};

const LayoutRenderer: React.FC<{ layout: LayoutNode; tab: Tab }> = ({ layout, tab }) => {
  const { setActivePane } = useAppStore();

  if (layout.type === 'leaf') {
    const pane = tab.panes.find((p) => p.id === layout.paneId);
    if (!pane) return null;

    const handleFocus = () => {
      const ws = useAppStore.getState().getActiveWorkspace();
      if (ws && pane.id !== tab.activePaneId) {
        setActivePane(ws.id, tab.id, pane.id);
      }
    };

    if (pane.type === 'browser') {
      return (
        <div onClick={handleFocus} style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <BrowserPane pane={pane} isActive={pane.id === tab.activePaneId} />
        </div>
      );
    }
    return (
      <div onClick={handleFocus} style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <TerminalPane pane={pane} isActive={pane.id === tab.activePaneId} />
      </div>
    );
  }

  return (
    <div className={`split-${layout.direction}`} style={{ display: 'flex', flex: 1 }}>
      {layout.children.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <SplitDivider direction={layout.direction} />}
          <div style={{ flex: layout.sizes[i] || 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
            <LayoutRenderer layout={child} tab={tab} />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

const SplitDivider: React.FC<{ direction: 'horizontal' | 'vertical' }> = ({ direction }) => {
  const [dragging, setDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const parent = dividerRef.current?.parentElement;
    if (!parent) return;

    const prev = dividerRef.current?.previousElementSibling as HTMLElement;
    const next = dividerRef.current?.nextElementSibling as HTMLElement;
    if (!prev || !next) return;

    const startPos = direction === 'vertical' ? e.clientX : e.clientY;
    const prevStart = direction === 'vertical' ? prev.offsetWidth : prev.offsetHeight;
    const nextStart = direction === 'vertical' ? next.offsetWidth : next.offsetHeight;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = (direction === 'vertical' ? e.clientX : e.clientY) - startPos;
      const total = prevStart + nextStart;
      const newPrev = Math.max(100, prevStart + delta);
      const newNext = Math.max(100, total - newPrev);
      prev.style.flex = `0 0 ${newPrev}px`;
      next.style.flex = `0 0 ${newNext}px`;
    };

    const handleMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction]);

  return (
    <div
      ref={dividerRef}
      className={`split-divider ${dragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    />
  );
};
