import React from 'react';
import { useAppStore } from '../stores/app-store';

export const TabBar: React.FC = () => {
  const { workspaces, activeWorkspaceId, addPaneToWorkspace, removePane } = useAppStore();
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

  if (!workspace) return null;

  return (
    <div className="tab-bar">
      {workspace.tabs.map((tab) =>
        tab.panes.map((pane) => (
          <div
            key={pane.id}
            className={`tab-item ${pane.id === tab.activePaneId ? 'active' : ''}`}
            onClick={() => useAppStore.getState().setActivePane(workspace.id, tab.id, pane.id)}
          >
            <span className="tab-title">{pane.title}</span>
            <button className="tab-close" onClick={(e) => handleCloseTab(e, pane.id)}>&times;</button>
          </div>
        ))
      )}
      <button className="tab-new" onClick={handleNewTab} title="New tab (Ctrl+T)">+</button>
    </div>
  );
};
