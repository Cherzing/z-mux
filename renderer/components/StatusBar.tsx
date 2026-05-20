import React from 'react';
import { useAppStore } from '../stores/app-store';

export const StatusBar: React.FC = () => {
  const { workspaces, activeWorkspaceId, unreadCount, notifications } = useAppStore();
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeTab = workspace?.tabs.find((t) => t.id === workspace.activeTabId);
  const activePane = activeTab?.panes.find((p) => p.id === activeTab.activePaneId);

  return (
    <div className="status-bar">
      <div className="status-bar-item">
        {workspace?.name || 'No workspace'}
      </div>
      {activePane?.git?.branch && (
        <div className="status-bar-item" style={{ color: 'var(--success)' }}>
          {activePane.git.branch}{activePane.git.isDirty ? '*' : ''}
          {activePane.git.ahead > 0 && ` ?${activePane.git.ahead}`}
          {activePane.git.behind > 0 && ` ?${activePane.git.behind}`}
        </div>
      )}
      {activePane?.git?.prNumber && (
        <div className="status-bar-item" style={{ color: 'var(--accent)' }}>
          {activePane.git.prNumber} ({activePane.git.prStatus})
        </div>
      )}
      {activePane?.listeningPorts && activePane.listeningPorts.length > 0 && (
        <div className="status-bar-item" style={{ color: 'var(--warning)' }}>
          Ports: {activePane.listeningPorts.join(', ')}
        </div>
      )}
      <div className="status-bar-right">
        {unreadCount > 0 && (
          <div className="status-bar-item" style={{ color: 'var(--accent)', cursor: 'pointer' }}
            onClick={() => (window as any).zmux.notification.jumpToLatest()}>
            {unreadCount} unread
          </div>
        )}
        <div className="status-bar-item">
          {activePane?.type === 'terminal' ? 'Terminal' : activePane?.type === 'browser' ? 'Browser' : ''}
        </div>
        <div className="status-bar-item">z-mux v0.1.0</div>
      </div>
    </div>
  );
};
