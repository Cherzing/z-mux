import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Pane } from '../stores/app-store';

const api = (window as any).zmux;

async function execAutomation(wv: any, command: string, args: any): Promise<any> {
  try {
    switch (command) {
      case 'navigate': { wv.loadURL(args.url); return { ok: true, url: args.url }; }
      case 'snapshot': {
        const tree = await wv.executeJavaScript(`(function() {
          function snap(el, depth) {
            if (depth > 8) return null;
            const r = el.getBoundingClientRect();
            const info = { role: el.getAttribute('role') || el.tagName.toLowerCase(), name: el.getAttribute('aria-label') || el.getAttribute('name') || el.getAttribute('title') || el.innerText?.slice(0,80) || '', tag: el.tagName.toLowerCase(), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
            if (el.id) info.id = el.id;
            if (el.className && typeof el.className === 'string') info.class = el.className.slice(0,60);
            const children = [];
            for (const c of el.children) { const s = snap(c, depth+1); if (s) children.push(s); }
            if (children.length) info.children = children;
            return info;
          }
          return JSON.stringify(snap(document.body, 0));
        })()`);
        return { ok: true, result: JSON.parse(tree) };
      }
      case 'click': {
        await wv.executeJavaScript(`document.querySelector(${JSON.stringify(args.selector)}).click()`);
        return { ok: true };
      }
      case 'fill': {
        await wv.executeJavaScript(`(function() {
          const el = document.querySelector(${JSON.stringify(args.selector)});
          const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSet.call(el, ${JSON.stringify(args.value)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        return { ok: true };
      }
      case 'type': {
        await wv.executeJavaScript(`(function() {
          const el = document.querySelector(${JSON.stringify(args.selector)});
          el.focus();
          el.value += ${JSON.stringify(args.text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
        return { ok: true };
      }
      case 'eval': {
        const result = await wv.executeJavaScript(args.expression);
        return { ok: true, result };
      }
      case 'get': {
        const props: Record<string, string> = { title: 'document.title', url: 'window.location.href', text: 'document.body.innerText', html: 'document.body.innerHTML' };
        const expr = props[args.property] || `document.querySelector(${JSON.stringify(args.property)})?.textContent`;
        const val = await wv.executeJavaScript(expr);
        return { ok: true, result: val };
      }
      case 'screenshot': {
        const dataUrl = await wv.executeJavaScript(`(async () => {
          const canvas = document.createElement('canvas');
          canvas.width = window.innerWidth; canvas.height = window.innerHeight;
          // Use html2canvas or just return null for now
          return null;
        })()`);
        return { ok: true, result: dataUrl };
      }
      case 'find': {
        const els = await wv.executeJavaScript(`(function() {
          const els = document.querySelectorAll(${JSON.stringify(args.selector)});
          return Array.from(els).map((el,i) => ({ index: i, tag: el.tagName.toLowerCase(), text: el.innerText?.slice(0,100), id: el.id, class: el.className?.toString().slice(0,60) }));
        })()`);
        return { ok: true, result: els };
      }
      case 'wait': {
        const timeout = args.timeout || 5000;
        const start = Date.now();
        while (Date.now() - start < timeout) {
          if (args.selector) {
            const found = await wv.executeJavaScript(`!!document.querySelector(${JSON.stringify(args.selector)})`);
            if (found) return { ok: true, result: 'found' };
          }
          if (args.text) {
            const found = await wv.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(args.text)})`);
            if (found) return { ok: true, result: 'found' };
          }
          if (args.url) {
            const current = await wv.executeJavaScript('window.location.href');
            if (current.includes(args.url)) return { ok: true, result: 'found' };
          }
          await new Promise(r => setTimeout(r, 200));
        }
        return { ok: false, error: 'Timeout waiting' };
      }
      case 'press': {
        await wv.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(args.key)}, bubbles: true }))`);
        return { ok: true };
      }
      case 'select': {
        await wv.executeJavaScript(`(function() {
          const el = document.querySelector(${JSON.stringify(args.selector)});
          if (el.tagName === 'SELECT') {
            ${JSON.stringify(args.values)}.forEach(v => { const opt = Array.from(el.options).find(o => o.value === v || o.text === v); if (opt) opt.selected = true; });
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()`);
        return { ok: true };
      }
      case 'scroll': {
        const dir = args.direction || 'down';
        const amount = dir === 'up' ? -500 : dir === 'down' ? 500 : dir === 'left' ? -500 : 500;
        if (args.selector) {
          await wv.executeJavaScript(`document.querySelector(${JSON.stringify(args.selector)}).scrollBy(${dir === 'left' || dir === 'right' ? amount : 0}, ${dir === 'up' || dir === 'down' ? amount : 0})`);
        } else {
          await wv.executeJavaScript(`window.scrollBy(${dir === 'left' || dir === 'right' ? amount : 0}, ${dir === 'up' || dir === 'down' ? amount : 0})`);
        }
        return { ok: true };
      }
      case 'cookies': {
        if (args.action === 'get') {
          const cookies = await wv.executeJavaScript('document.cookie');
          return { ok: true, result: cookies };
        } else if (args.action === 'set' && args.data) {
          await wv.executeJavaScript(`document.cookie = ${JSON.stringify(args.data)}`);
          return { ok: true };
        } else if (args.action === 'clear') {
          await wv.executeJavaScript(`document.cookie.split(';').forEach(c => { document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; })`);
          return { ok: true };
        }
        return { ok: false, error: 'Invalid cookies action' };
      }
      case 'storage': {
        if (args.action === 'get') {
          const data = await wv.executeJavaScript(`JSON.stringify({ localStorage: { ...localStorage }, sessionStorage: { ...sessionStorage } })`);
          return { ok: true, result: JSON.parse(data) };
        } else if (args.action === 'clear') {
          await wv.executeJavaScript('localStorage.clear(); sessionStorage.clear()');
          return { ok: true };
        }
        return { ok: false, error: 'Invalid storage action' };
      }
      case 'highlight': {
        await wv.executeJavaScript(`(function() {
          const el = document.querySelector(${JSON.stringify(args.selector)});
          if (el) { el.style.outline = '3px solid #4c71f2'; setTimeout(() => el.style.outline = '', 3000); }
        })()`);
        return { ok: true };
      }
      case 'is': {
        const check = args.check;
        let result = false;
        if (check === 'visible') result = await wv.executeJavaScript(`(function() { const el = document.querySelector(${JSON.stringify(args.selector)}); return el && el.offsetParent !== null })()`);
        else if (check === 'enabled') result = await wv.executeJavaScript(`(function() { const el = document.querySelector(${JSON.stringify(args.selector)}); return el && !el.disabled })()`);
        else if (check === 'checked') result = await wv.executeJavaScript(`(function() { const el = document.querySelector(${JSON.stringify(args.selector)}); return el && el.checked })()`);
        return { ok: true, result };
      }
      default:
        return { ok: false, error: `Unknown command: ${command}` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

interface BrowserPaneProps {
  pane: Pane;
  isActive: boolean;
}

export const BrowserPane: React.FC<BrowserPaneProps> = ({ pane, isActive }) => {
  const [url, setUrl] = useState('https://www.google.com');
  const [inputUrl, setInputUrl] = useState('https://www.google.com');
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [title, setTitle] = useState('New Tab');
  const webviewRef = useRef<HTMLWebViewElement>(null);

  useEffect(() => {
    const wv = webviewRef.current as any;
    if (!wv) return;

    const handleDidNavigate = () => {
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());
      setUrl(wv.getURL());
      setInputUrl(wv.getURL());
    };

    const handleDidNavigateInPage = () => {
      setCanGoBack(wv.canGoBack());
      setCanGoForward(wv.canGoForward());
      setUrl(wv.getURL());
      setInputUrl(wv.getURL());
    };

    const handlePageTitleUpdated = (e: any) => {
      setTitle(e.title || 'New Tab');
    };

    const handleDidStartLoading = () => setLoading(true);
    const handleDidStopLoading = () => setLoading(false);

    wv.addEventListener('did-navigate', handleDidNavigate);
    wv.addEventListener('did-navigate-in-page', handleDidNavigateInPage);
    wv.addEventListener('page-title-updated', handlePageTitleUpdated);
    wv.addEventListener('did-start-loading', handleDidStartLoading);
    wv.addEventListener('did-stop-loading', handleDidStopLoading);

    return () => {
      wv.removeEventListener('did-navigate', handleDidNavigate);
      wv.removeEventListener('did-navigate-in-page', handleDidNavigateInPage);
      wv.removeEventListener('page-title-updated', handlePageTitleUpdated);
      wv.removeEventListener('did-start-loading', handleDidStartLoading);
      wv.removeEventListener('did-stop-loading', handleDidStopLoading);
    };
  }, []);

  const handleNavigate = useCallback((targetUrl: string) => {
    let finalUrl = targetUrl;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
        finalUrl = `https://${targetUrl}`;
      } else {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
      }
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);
    setLoading(true);
    if (webviewRef.current as any) {
      (webviewRef.current as any).loadURL(finalUrl);
    }
  }, []);

  const handleBack = useCallback(() => {
    const wv = webviewRef.current as any;
    if (wv?.canGoBack()) wv.goBack();
  }, []);

  const handleForward = useCallback(() => {
    const wv = webviewRef.current as any;
    if (wv?.canGoForward()) wv.goForward();
  }, []);

  const handleReload = useCallback(() => {
    (webviewRef.current as any)?.reload();
  }, []);

  // ── Browser automation: listen for commands from main process ──
  useEffect(() => {
    const api = (window as any).zmux;
    if (!api?.ipc) return;

    const cleanup = api.ipc.on('browser:automation:command', async (requestId: string, surfaceId: string, command: string, args: any) => {
      if (surfaceId !== pane.id) return;
      const wv = webviewRef.current as any;
      if (!wv) {
        api.ipc.send('browser:automation:result', requestId, { ok: false, error: 'No webview' });
        return;
      }
      const result = await execAutomation(wv, command, args);
      api.ipc.send('browser:automation:result', requestId, result);
    });

    return cleanup;
  }, [pane.id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNavigate(inputUrl);
  };

  return (
    <div className={`browser-pane ${isActive ? 'active' : ''}`}>
      <div className="terminal-pane-header">
        <span className="terminal-pane-title">{title}</span>
        <div className="terminal-pane-actions">
          <button className="terminal-pane-action" onClick={handleBack}
            style={{ opacity: canGoBack ? 1 : 0.3 }} title="Back (Alt+Left)">&#x25C0;</button>
          <button className="terminal-pane-action" onClick={handleForward}
            style={{ opacity: canGoForward ? 1 : 0.3 }} title="Forward (Alt+Right)">&#x25B6;</button>
          <button className="terminal-pane-action" onClick={handleReload} title="Reload (Ctrl+R)">&#x21BB;</button>
          <button className="terminal-pane-action" onClick={() => {
            const wv = webviewRef.current as any;
            if (wv) wv.stop();
          }} title="Stop">&#x2716;</button>
        </div>
      </div>
      <div className="browser-toolbar">
        <button className="browser-nav-btn" onClick={handleBack}
          style={{ opacity: canGoBack ? 1 : 0.3 }}>&#x25C0;</button>
        <button className="browser-nav-btn" onClick={handleForward}
          style={{ opacity: canGoForward ? 1 : 0.3 }}>&#x25B6;</button>
        <button className="browser-nav-btn" onClick={handleReload}>&#x21BB;</button>
        <input
          className="browser-url"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={(e) => e.target.select()}
          placeholder="Enter URL or search..."
        />
      </div>
      <div className="browser-content">
        <webview
          ref={webviewRef as any}
          src={url}
          style={{ width: '100%', height: '100%' }}
          allowpopups={'true' as any}
          partition={`persist:zmux-browser-${pane.id}`}
        />
      </div>
    </div>
  );
};
