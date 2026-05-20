import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/app-store';

export const Settings: React.FC = () => {
  const { setSettingsOpen } = useAppStore();
  const [settings, setSettings] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('terminal');

  useEffect(() => {
    (window as any).zmux.settings.get().then((s: any) => setSettings(s));
  }, []);

  const handleChange = (path: string, value: any) => {
    const keys = path.split('.');
    const newSettings = { ...settings };
    let obj = newSettings;
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = { ...obj[keys[i]] };
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setSettings(newSettings);
    (window as any).zmux.settings.set(newSettings);
  };

  if (!settings) return null;

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="sidebar-btn" onClick={() => setSettingsOpen(false)}>&times;</button>
        </div>
        <div className="settings-tabs">
          {['terminal', 'appearance', 'shortcuts', 'notifications'].map((tab) => (
            <button
              key={tab}
              className={`settings-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="settings-content">
          {activeTab === 'terminal' && (
            <div className="settings-section">
              <h3>Terminal</h3>
              <label>
                Font Size
                <input type="number" min={8} max={32} value={settings.terminal?.fontSize || 14}
                  onChange={(e) => handleChange('terminal.fontSize', parseInt(e.target.value))} />
              </label>
              <label>
                Font Family
                <input type="text" value={settings.terminal?.fontFamily || ''}
                  onChange={(e) => handleChange('terminal.fontFamily', e.target.value)} />
              </label>
              <label>
                Cursor Style
                <select value={settings.terminal?.cursorStyle || 'block'}
                  onChange={(e) => handleChange('terminal.cursorStyle', e.target.value)}>
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                  <option value="bar">Bar</option>
                </select>
              </label>
              <label>
                <input type="checkbox" checked={settings.terminal?.cursorBlink ?? true}
                  onChange={(e) => handleChange('terminal.cursorBlink', e.target.checked)} />
                Cursor Blink
              </label>
              <label>
                Scrollback Lines
                <input type="number" min={100} max={100000} value={settings.terminal?.scrollback || 10000}
                  onChange={(e) => handleChange('terminal.scrollback', parseInt(e.target.value))} />
              </label>
            </div>
          )}
          {activeTab === 'appearance' && (
            <div className="settings-section">
              <h3>Appearance</h3>
              <label>
                Sidebar Width
                <input type="number" min={160} max={400} value={settings.appearance?.sidebarWidth || 240}
                  onChange={(e) => handleChange('appearance.sidebarWidth', parseInt(e.target.value))} />
              </label>
              <label>
                Accent Color
                <input type="color" value={settings.appearance?.accentColor || '#4c71f2'}
                  onChange={(e) => handleChange('appearance.accentColor', e.target.value)} />
              </label>
              <label>
                <input type="checkbox" checked={settings.appearance?.showGitBranch ?? true}
                  onChange={(e) => handleChange('appearance.showGitBranch', e.target.checked)} />
                Show Git Branch
              </label>
              <label>
                <input type="checkbox" checked={settings.appearance?.showPRStatus ?? true}
                  onChange={(e) => handleChange('appearance.showPRStatus', e.target.checked)} />
                Show PR Status
              </label>
              <label>
                <input type="checkbox" checked={settings.appearance?.showPorts ?? true}
                  onChange={(e) => handleChange('appearance.showPorts', e.target.checked)} />
                Show Listening Ports
              </label>
            </div>
          )}
          {activeTab === 'shortcuts' && (
            <div className="settings-section">
              <h3>Keyboard Shortcuts</h3>
              {Object.entries(settings.shortcuts || {}).map(([action, key]) => (
                <label key={action}>
                  {action.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())}
                  <input type="text" defaultValue={key as string}
                    onBlur={(e) => handleChange(`shortcuts.${action}`, e.target.value)} />
                </label>
              ))}
            </div>
          )}
          {activeTab === 'notifications' && (
            <div className="settings-section">
              <h3>Notifications</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                z-mux detects terminal escape sequences (OSC 9/99/777) and CLI notifications.
                Configure hooks via <code>zmux hooks setup</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
