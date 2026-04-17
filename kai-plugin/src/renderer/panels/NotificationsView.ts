/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState } from '../lib/react.js';
import { Section, ActionButton, NotificationRow, EmptyState } from '../components/index.js';

export function NotificationsView({ pluginState, onAction }: any): any {
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState('');
  const notifications = Array.isArray(pluginState?.notifications) ? pluginState.notifications : [];
  const filtered = filter === 'all' ? notifications : notifications.filter((item: any) => item.severity === filter);

  const markRead = async (id: string) => {
    await Promise.resolve(onAction?.('notification-mark-read', { id }));
  };

  return h(
    'div',
    { className: 'space-y-5' },
    h(Section, {
      title: 'Notification Feed',
      subtitle: 'Legion SSE activity, proactive events, and workflow alerts stored inside plugin state.',
      actions: [
        h(ActionButton, { key: 'recent', label: 'Load Recent Events', onClick: () => onAction?.('load-recent-events'), variant: 'secondary' }),
        h(ActionButton, { key: 'read', label: 'Mark All Read', onClick: () => onAction?.('notification-mark-all-read'), variant: 'secondary' }),
        h(ActionButton, { key: 'clear', label: 'Clear', onClick: () => onAction?.('notification-clear'), variant: 'secondary' }),
      ],
    },
    h('div', { className: 'flex flex-wrap gap-2' },
      (['all', 'error', 'warn', 'success', 'info'] as const).map((severity) => h(ActionButton, {
        key: severity,
        label: severity === 'all' ? `All (${notifications.length})` : `${severity} (${notifications.filter((item: any) => item.severity === severity).length})`,
        onClick: () => setFilter(severity),
        variant: filter === severity ? 'default' : 'secondary',
      })),
    ),
    filtered.length === 0
      ? h(EmptyState, { title: 'No notifications', body: 'Daemon events, proactive messages, and workflow alerts will appear here.' })
      : h(
        'div',
        { className: 'space-y-2' },
        filtered.map((notification: any) => h(NotificationRow, {
          key: notification.id,
          notification,
          expanded: expandedId === notification.id,
          onToggle: () => setExpandedId(expandedId === notification.id ? '' : notification.id),
          onRead: () => { void markRead(notification.id); },
        })),
      )),
  );
}
