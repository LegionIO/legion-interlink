/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { Section, KeyValueGrid } from '../components/index.js';

export function RuntimeTab({ pluginState, draft }: any): any {
  const summaryItems: [string, string][] = [
    ['Status', pluginState?.status || 'unknown'],
    ['Daemon URL', pluginState?.serviceUrl || draft.daemonUrl || 'not set'],
    ['Auth Source', pluginState?.authSource || 'none'],
    ['Config Dir', pluginState?.resolvedConfigDir || draft.configDir || 'auto-detect'],
    ['Events', pluginState?.eventsConnected ? 'connected' : 'disconnected'],
    ['Unread Notifications', String(pluginState?.unreadNotificationCount || 0)],
    ['Managed Threads', String((pluginState?.managedConversationIds || []).length)],
    ['Workflows', String(pluginState?.workflowCounts?.total || 0)],
  ];

  return h(Section, {
    title: 'Runtime Snapshot',
    subtitle: 'Live Legion plugin state published from the host process.',
  },
  h(KeyValueGrid, { items: summaryItems }));
}
