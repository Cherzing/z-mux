import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { Pane, useAppStore } from '../stores/app-store';

interface TerminalPaneProps {
  pane: Pane;
  isActive: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ pane, isActive }) => {
  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const searchAddon = useRef<SearchAddon | null>(null);
  const mounted = useRef(false);
  const { updatePaneTitle, setFindBarVisible, findBarVisible, findText, setFindText } = useAppStore();

  useEffect(() => {
    if (!termRef.current || mounted.current) return;
    mounted.current = true;

    const term = new Terminal({
      fontSize: 14,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      theme: {
        background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
        selectionBackground: '#585b70',
        black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
        blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
        brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
        brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8'
      },
      cursorBlink: true, cursorStyle: 'block', scrollback: 10000,
      allowTransparency: true, allowProposedApi: true, windowsMode: true
    });

    const fit = new FitAddon();
    const links = new WebLinksAddon();
    const search = new SearchAddon();
    const unicode = new Unicode11Addon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.loadAddon(search);
    term.loadAddon(unicode);
    try { term.unicode.activeVersion = '11'; } catch {}
    term.open(termRef.current);
    setTimeout(() => fit.fit(), 50);
    termInstance.current = term;
    fitAddon.current = fit;
    searchAddon.current = search;

    term.onData((data) => (window as any).zmux.surface.sendInput(pane.id, data));
    term.onResize(({ cols, rows }) => (window as any).zmux.surface.resize(pane.id, cols, rows));

    const handleData = (e: Event) => {
      const { id, data } = (e as CustomEvent).detail;
      if (id === pane.id && termInstance.current) termInstance.current.write(data);
    };
    const handleExit = (e: Event) => {
      const { id, code } = (e as CustomEvent).detail;
      if (id === pane.id && termInstance.current) {
        termInstance.current.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
      }
    };
    const handleTitle = (e: Event) => {
      const { id, title } = (e as CustomEvent).detail;
      if (id === pane.id) updatePaneTitle(id, title);
    };

    window.addEventListener('terminal:data', handleData);
    window.addEventListener('terminal:exit', handleExit);
    window.addEventListener('terminal:title', handleTitle);

    const observer = new ResizeObserver(() => { if (termInstance.current) fit.fit(); });
    observer.observe(termRef.current);
    term.focus();

    return () => {
      window.removeEventListener('terminal:data', handleData);
      window.removeEventListener('terminal:exit', handleExit);
      window.removeEventListener('terminal:title', handleTitle);
      observer.disconnect();
      term.dispose();
      termInstance.current = null;
      mounted.current = false;
    };
  }, [pane.id]);

  useEffect(() => {
    if (isActive && termInstance.current) {
      termInstance.current.focus();
      fitAddon.current?.fit();
    }
  }, [isActive]);

  // Find functionality
  useEffect(() => {
    if (findBarVisible && findText && searchAddon.current) {
      searchAddon.current.findNext(findText);
    }
  }, [findText, findBarVisible]);

  const handleSplitRight = useCallback(() => (window as any).zmux.surface.splitRight(pane.id), [pane.id]);
  const handleSplitDown = useCallback(() => (window as any).zmux.surface.splitDown(pane.id), [pane.id]);
  const handleClose = useCallback(() => {
    (window as any).zmux.surface.close(pane.id);
    useAppStore.getState().removePane(pane.id);
  }, [pane.id]);
  const handleZoom = useCallback(() => (window as any).zmux.surface.zoom(pane.id), [pane.id]);

  return (
    <div className={`terminal-pane ${isActive ? 'active' : ''} ${pane.hasNotification ? 'notification-ring' : ''}`}>
      <div className="terminal-pane-header">
        <span className="terminal-pane-title">
          {pane.git?.branch && (
            <span style={{ color: 'var(--success)', marginRight: 4 }}>
              {pane.git.branch}{pane.git.isDirty ? '*' : ''}
            </span>
          )}
          {pane.git?.prNumber && (
            <span style={{ color: pane.git.prStatus === 'open' ? 'var(--accent)' : 'var(--text-muted)', marginRight: 4 }}>
              {pane.git.prNumber}
            </span>
          )}
          {pane.listeningPorts && pane.listeningPorts.length > 0 && (
            <span style={{ color: 'var(--warning)', marginRight: 4 }}>:{pane.listeningPorts[0]}</span>
          )}
          {pane.title}
        </span>
        <div className="terminal-pane-actions">
          <button className="terminal-pane-action" onClick={handleSplitRight} title="Split right (Ctrl+D)">&#x2503;</button>
          <button className="terminal-pane-action" onClick={handleSplitDown} title="Split down (Ctrl+Shift+D)">&#x2501;</button>
          <button className="terminal-pane-action" onClick={handleZoom} title="Zoom (Ctrl+Shift+Enter)">&#x26F6;</button>
          <button className="terminal-pane-action" onClick={() => setFindBarVisible(!findBarVisible)} title="Find (Ctrl+F)">&#x1F50D;</button>
          <button className="terminal-pane-action" onClick={handleClose} title="Close (Ctrl+W)">&times;</button>
        </div>
      </div>
      {findBarVisible && isActive && (
        <div className="find-bar">
          <input
            className="find-input"
            type="text"
            placeholder="Find..."
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchAddon.current?.findNext(findText);
              if (e.key === 'Escape') setFindBarVisible(false);
            }}
            autoFocus
          />
          <button className="find-btn" onClick={() => searchAddon.current?.findPrevious(findText)}>&#x25B2;</button>
          <button className="find-btn" onClick={() => searchAddon.current?.findNext(findText)}>&#x25BC;</button>
          <button className="find-btn" onClick={() => setFindBarVisible(false)}>&times;</button>
        </div>
      )}
      <div className="terminal-container" ref={termRef} />
    </div>
  );
};
