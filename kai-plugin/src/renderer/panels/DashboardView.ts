/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState } from '../lib/react.js';
import { fmtAgo, fmtUptime, fmtNumber } from '../lib/utils.js';
import { Badge, Section, ActionButton, StatCard, JsonBox, EmptyState } from '../components/index.js';

export function DashboardView({ pluginState, onAction }: any): any {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const dashboard = pluginState?.dashboard || null;
  const health = dashboard?.health || {};
  const taskSummary = dashboard?.tasksSummary || {};
  const workerSummary = dashboard?.workersSummary || {};
  const workflows = pluginState?.workflowCounts || {};
  const recentNotifications = Array.isArray(pluginState?.notifications) ? pluginState.notifications.slice(0, 8) : [];

  const runAction = async (action: string, data?: any) => {
    setBusy(true);
    setNote('');
    try {
      const result = await Promise.resolve(onAction?.(action, data));
      if (result?.ok === false && result?.error) {
        setNote(result.error);
      } else {
        setNote(action === 'run-doctor' ? 'Doctor checks refreshed.' : 'Refresh completed.');
      }
    } catch (error: any) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return h(
    'div',
    { className: 'space-y-5' },
    note ? h('div', { className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3 text-sm' }, note) : null,
    h(Section, {
      title: 'Cluster Snapshot',
      subtitle: 'A high-level runtime summary pulled from the daemon, event stream, and plugin workflow state.',
      actions: [
        h(ActionButton, { key: 'refresh', label: busy ? 'Refreshing...' : 'Refresh Status', onClick: () => runAction('refresh-status'), disabled: busy }),
        h(ActionButton, { key: 'doctor', label: 'Run Doctor', onClick: () => runAction('run-doctor'), disabled: busy, variant: 'secondary' }),
        h(ActionButton, { key: 'events', label: 'Load Recent Events', onClick: () => runAction('load-recent-events'), disabled: busy, variant: 'secondary' }),
        h(ActionButton, { key: 'gaia', label: 'Open Proactive Thread', onClick: () => runAction('open-proactive-thread'), disabled: busy, variant: 'secondary' }),
      ],
    },
    dashboard ? h(
      'div',
      { className: 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4' },
      h(StatCard, { label: 'Status', value: pluginState?.status || 'unknown', subvalue: dashboard?.updatedAt ? `Updated ${fmtAgo(dashboard.updatedAt)} ago` : '' }),
      h(StatCard, { label: 'Uptime', value: fmtUptime(health?.uptime_seconds ?? health?.uptime), subvalue: health?.version ? `v${health.version}` : '' }),
      h(StatCard, { label: 'Tasks', value: fmtNumber(taskSummary.total), subvalue: `${fmtNumber(taskSummary.running)} running \u2022 ${fmtNumber(taskSummary.failed)} failed` }),
      h(StatCard, { label: 'Workers', value: fmtNumber(workerSummary.total), subvalue: `${fmtNumber(workerSummary.healthy)} healthy \u2022 ${fmtNumber(workerSummary.degraded)} degraded` }),
      h(StatCard, { label: 'Extensions', value: fmtNumber(dashboard?.extensionsCount || 0), subvalue: 'Loaded daemon extensions' }),
      h(StatCard, { label: 'Capabilities', value: fmtNumber((dashboard?.capabilities || []).length), subvalue: 'Natural-language router suggestions' }),
      h(StatCard, { label: 'Notifications', value: fmtNumber(pluginState?.unreadNotificationCount || 0), subvalue: `${fmtNumber((pluginState?.notifications || []).length)} retained` }),
      h(StatCard, { label: 'Workflows', value: fmtNumber(workflows.total || 0), subvalue: `${fmtNumber(workflows.active || 0)} active \u2022 ${fmtNumber(workflows.needsInput || 0)} needs input` }),
    ) : h(EmptyState, { title: 'No dashboard snapshot yet', body: 'Refresh status to load the current daemon summary.' })),
    h(Section, {
      title: 'Live Details',
      subtitle: 'Recent health and service summaries preserved in plugin state.',
    },
    h('div', { className: 'grid gap-4 xl:grid-cols-2' },
      h(JsonBox, { value: dashboard?.health, emptyLabel: 'No health payload recorded yet.' }),
      h(JsonBox, { value: { gaia: dashboard?.gaia, metering: dashboard?.metering, github: dashboard?.githubStatus, knowledge: dashboard?.knowledgeStatus }, emptyLabel: 'No auxiliary service data yet.' }),
    )),
    h(Section, {
      title: 'Recent Activity',
      subtitle: 'Newest daemon notifications retained by the plugin event log.',
    },
    recentNotifications.length === 0
      ? h('p', { className: 'text-sm text-muted-foreground' }, 'No Legion events have been captured yet.')
      : h(
        'div',
        { className: 'space-y-2' },
        recentNotifications.map((notification: any) => h(
          'div',
          { key: notification.id, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', { className: 'flex flex-wrap items-center gap-2' },
            h('span', { className: 'text-sm font-medium' }, notification.title),
            h(Badge, { status: notification.severity }),
          ),
          h('div', { className: 'mt-1 text-xs text-muted-foreground' }, `${notification.type} \u2022 ${fmtAgo(notification.timestamp)}${notification.source ? ` \u2022 ${notification.source}` : ''}`),
          notification.message ? h('div', { className: 'mt-2 text-sm text-muted-foreground' }, notification.message) : null,
        )),
      )),
  );
}
