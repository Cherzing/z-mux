import { EventEmitter } from 'events';
import { Notification } from 'electron';

export interface ZmuxNotification {
  id: string;
  surfaceId: string;
  workspaceId: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  type: 'agent-waiting' | 'task-complete' | 'error' | 'info';
  metadata?: Record<string, any>;
}

export class NotificationManager extends EventEmitter {
  private notifications: Map<string, ZmuxNotification> = new Map();
  private unreadCount: number = 0;

  addNotification(notification: Omit<ZmuxNotification, 'id' | 'timestamp' | 'read'>): string {
    const id = `notif:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const full: ZmuxNotification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false
    };

    this.notifications.set(id, full);
    this.unreadCount++;

    this.emit('new', full);
    this.emit('stateChanged', this.getState());

    if (notification.type === 'agent-waiting') {
      this.showSystemNotification(full);
    }

    return id;
  }

  markRead(id: string): void {
    const notif = this.notifications.get(id);
    if (notif && !notif.read) {
      notif.read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.emit('stateChanged', this.getState());
    }
  }

  markAllRead(): void {
    for (const notif of this.notifications.values()) {
      notif.read = true;
    }
    this.unreadCount = 0;
    this.emit('stateChanged', this.getState());
  }

  toggleUnread(id: string): void {
    const notif = this.notifications.get(id);
    if (notif) {
      notif.read = !notif.read;
      this.unreadCount += notif.read ? -1 : 1;
      this.emit('stateChanged', this.getState());
    }
  }

  getLatestUnread(): ZmuxNotification | null {
    let latest: ZmuxNotification | null = null;
    for (const notif of this.notifications.values()) {
      if (!notif.read && (!latest || notif.timestamp > latest.timestamp)) {
        latest = notif;
      }
    }
    return latest;
  }

  getAll(): ZmuxNotification[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getUnreadCount(): number {
    return this.unreadCount;
  }

  getState() {
    return {
      notifications: this.getAll(),
      unreadCount: this.unreadCount
    };
  }

  private showSystemNotification(notif: ZmuxNotification) {
    if (Notification.isSupported()) {
      const systemNotif = new Notification({
        title: notif.title,
        body: notif.body,
        silent: false
      });
      systemNotif.show();
    }
  }

  parseOSCSequence(surfaceId: string, data: string): void {
    const osc9Match = data.match(/\x1b\]9;(.+?)\x1b\\/);
    if (osc9Match) {
      this.addNotification({
        surfaceId,
        workspaceId: '',
        title: 'Terminal Notification',
        body: osc9Match[1],
        type: 'info'
      });
    }

    const osc777Match = data.match(/\x1b\]777;(.+?)\x1b\\/);
    if (osc777Match) {
      this.addNotification({
        surfaceId,
        workspaceId: '',
        title: 'Agent Notification',
        body: osc777Match[1],
        type: 'agent-waiting'
      });
    }

    const osc99Match = data.match(/\x1b\]99;(.+?)\x1b\\/);
    if (osc99Match) {
      try {
        const payload = JSON.parse(osc99Match[1]);
        this.addNotification({
          surfaceId,
          workspaceId: '',
          title: payload.title || 'Notification',
          body: payload.body || '',
          type: payload.type || 'info',
          metadata: payload.metadata
        });
      } catch {
        this.addNotification({
          surfaceId,
          workspaceId: '',
          title: 'Notification',
          body: osc99Match[1],
          type: 'info'
        });
      }
    }
  }
}
