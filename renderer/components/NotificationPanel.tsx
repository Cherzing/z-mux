import React from 'react';
import { useAppStore } from '../stores/app-store';

export const NotificationPanel: React.FC = () => {
  const { notifications, unreadCount, rightSidebarVisible, toggleRightSidebar, setNotifications } = useAppStore();

  const handleMarkAllRead = async () => {
    await (window as any).zmux.notification.markAllRead();
    setNotifications(notifications.map((n) => ({ ...n, read: true })), 0);
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className={`notification-panel ${rightSidebarVisible ? '' : 'collapsed'}`}>
      <div className="notification-header">
        <h3>Notifications {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}</h3>
        <div className="sidebar-actions">
          {unreadCount > 0 && <button className="sidebar-btn" onClick={handleMarkAllRead} title="Mark all read">&#x2713;</button>}
          <button className="sidebar-btn" onClick={toggleRightSidebar}>&times;</button>
        </div>
      </div>
      <div className="notification-list">
        {notifications.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No notifications</div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={`notification-item ${n.read ? '' : 'unread'}`}>
              <div className="notification-title">{n.title}</div>
              <div className="notification-body">{n.body}</div>
              <div className="notification-time">{formatTime(n.timestamp)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
