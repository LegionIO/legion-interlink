/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { cx, fmtAgo, fmtTime } from '../lib/utils.js';
import { Badge } from './Badge.js';
import { JsonBox } from './JsonBox.js';

type Notification = {
  id: string;
  title: string;
  severity: string;
  type: string;
  timestamp: string;
  source?: string;
  message?: string;
  read?: boolean;
  raw?: any;
};

type Props = {
  notification: Notification;
  expanded: boolean;
  onToggle: () => void;
  onRead: () => void;
};

export function NotificationRow({ notification, expanded, onToggle, onRead }: Props): any {
  return h(
    'div',
    {
      className: cx(
        'rounded-2xl border border-border/60 bg-background/45 transition-colors',
        !notification.read && 'ring-1 ring-primary/30',
      ),
    },
    h(
      'button',
      {
        type: 'button',
        onClick: () => {
          if (!notification.read) onRead();
          onToggle();
        },
        className: 'flex w-full items-start justify-between gap-3 px-4 py-3 text-left',
      },
      h(
        'div',
        { className: 'min-w-0 flex-1' },
        h(
          'div',
          { className: 'flex flex-wrap items-center gap-2' },
          !notification.read ? h('span', { className: 'h-2 w-2 rounded-full bg-primary' }) : null,
          h('span', { className: 'text-sm font-medium' }, notification.title),
          h(Badge, { status: notification.severity }),
        ),
        h(
          'p',
          { className: 'mt-1 text-xs text-muted-foreground' },
          `${notification.type} • ${fmtAgo(notification.timestamp)}${notification.source ? ` • ${notification.source}` : ''}`,
        ),
        notification.message && !expanded
          ? h('p', { className: 'mt-2 truncate text-sm text-muted-foreground' }, notification.message)
          : null,
      ),
      h('span', { className: 'text-xs text-muted-foreground' }, expanded ? 'Hide' : 'Show'),
    ),
    expanded
      ? h(
          'div',
          { className: 'border-t border-border/50 px-4 py-3' },
          notification.message
            ? h('p', { className: 'whitespace-pre-wrap text-sm text-muted-foreground' }, notification.message)
            : null,
          h('div', { className: 'mt-3 text-[11px] text-muted-foreground' }, fmtTime(notification.timestamp)),
          h(
            'details',
            { className: 'mt-3' },
            h('summary', { className: 'cursor-pointer text-xs text-muted-foreground' }, 'Raw event'),
            h(JsonBox, { value: notification.raw, emptyLabel: 'No raw payload.' }),
          ),
        )
      : null,
  );
}
