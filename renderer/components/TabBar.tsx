import React from 'react';
import { useAppStore } from '../stores/app-store';

export const TabBar: React.FC = () => {
  const { workspaces, activeWorkspaceId, addPaneToWorkspace, removePane, setActivePane } = useAppStore();
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const handleNewTab = async () => {
    if (!workspace) return;
    const paneId = await (window as any).zmux.surface.create(workspace.id);
    if (paneId) {
      addPaneToWorkspace(workspace.id, paneId);
    }
  };

  const handleCloseTab = (e: React.MouseEvent, paneId: string) => {
    e.stopPropagation();
    (window as any).zmux.surface.close(paneId);
    removePane(paneId);
  };

  const handleTabClick = (tabId: string, paneId: string) => {
    if (workspace) setActivePane(workspace.id, tabId, paneId);
  };

  if (!workspace) return null;

  // Collect all panes across all tabs
  const allPanes = workspace.tabs.flatMap((tab) =>
    tab.panes.map((pane) => ({ tabId: tab.id, pane }))
  );

  return (
    <div className="tab-bar">
      {allPanes.map(({ tabId, pane }) => (
        <div
          key={pane.id}
          className={`tab-item ${pane.id === workspace.tabs.find((t) => t.id === workspace.activeTabId)?.activePaneId ? 'active' : ''}`}
          onClick={() => handleTabClick(tabId, pane.id)}
        >
          {pane.git?.branch && (
            <span style={{ color: 'var(--success)', fontSize: 10, marginRight: 4 }}>{pane.git.branch}</span>
          )}
          <span className="tab-title">{pane.title}</span>
          <button className="tab-close" onClick={(e) => handleCloseTab(e, pane.id)}>&times;</button>
        </div>
      ))}
      <button className="tab-new" onClick={handleNewTab} title="New tab (Ctrl+T)">+</button>
    </div>
  );
};
