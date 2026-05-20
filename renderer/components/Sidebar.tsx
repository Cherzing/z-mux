import React from 'react';
import { useAppStore } from '../stores/app-store';

export const Sidebar: React.FC = () => {
  const {
    workspaces, activeWorkspaceId, sidebarVisible, notifications,
    setActiveWorkspaceId, removeWorkspace, addWorkspace
  } = useAppStore();

  const handleNewWorkspace = async () => {
    const result = await (window as any).zmux.workspace.create();
    if (result) {
      addWorkspace(result.workspaceId, undefined, result.paneId);
      setActiveWorkspaceId(result.workspaceId);
    }
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    (window as any).zmux.workspace.close(id);
    removeWorkspace(id);
  };

  return (
    <div className={`sidebar ${sidebarVisible ? '' : 'collapsed'}`}>
      <div className="sidebar-header">
        <h3>Workspaces</h3>
        <div className="sidebar-actions">
          <button className="sidebar-btn" onClick={handleNewWorkspace} title="New Workspace (Ctrl+Shift+N)">+</button>
        </div>
      </div>
      <div className="workspace-list">
        {workspaces.map((ws) => {
          const activeTab = ws.tabs.find((t) => t.id === ws.activeTabId);
          const activePane = activeTab?.panes.find((p) => p.id === activeTab.activePaneId);
          const unreadNotifs = notifications.filter((n) => !n.read && n.workspaceId === ws.id);
          const hasNotif = activePane?.hasNotification || unreadNotifs.length > 0;

          return (
            <div
              key={ws.id}
              className={`workspace-item ${ws.id === activeWorkspaceId ? 'active' : ''}`}
              onClick={() => setActiveWorkspaceId(ws.id)}
            >
              <div className="workspace-icon" style={ws.color ? { background: ws.color } : {}}>
                {ws.name.charAt(0).toUpperCase()}
              </div>
              <div className="workspace-info">
                <div className="workspace-name">{ws.name}</div>
                <div className="workspace-meta">
                  {activePane?.git?.branch && (
                    <span className="branch" title={activePane.git.isDirty ? 'Modified' : 'Clean'}>
                      {activePane.git.branch}{activePane.git.isDirty ? '*' : ''}
                    </span>
                  )}
                  {activePane?.git?.prNumber && (
                    <span className={`pr-${activePane.git.prStatus}`}> {activePane.git.prNumber}</span>
                  )}
                  {activePane?.listeningPorts && activePane.listeningPorts.length > 0 && (
                    <span className="ports"> :{activePane.listeningPorts[0]}</span>
                  )}
                  {activePane?.lastNotification && (
                    <span className="notif-text"> {activePane.lastNotification}</span>
                  )}
                  {!activePane?.git && activePane?.workingDir && (
                    <span className="workdir">{activePane.workingDir.split('\\').pop()}</span>
                  )}
                </div>
              </div>
              {hasNotif && <div className="workspace-notification" />}
              <button className="workspace-close" onClick={(e) => handleClose(e, ws.id)}>&times;</button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
