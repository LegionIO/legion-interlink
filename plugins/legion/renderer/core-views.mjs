export function createCoreViews(context) {
  const {
    h,
    useState,
    Badge,
    Section,
    ActionButton,
    Field,
    TextAreaField,
    Toggle,
    StatCard,
    JsonBox,
    EmptyState,
    NotificationRow,
    fmtAgo,
    fmtNumber,
    fmtTime,
    fmtUptime,
    parseJson,
  } = context;

  function DashboardView({ pluginState, onAction }) {
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const dashboard = pluginState?.dashboard || null;
    const health = dashboard?.health || {};
    const taskSummary = dashboard?.tasksSummary || {};
    const workerSummary = dashboard?.workersSummary || {};
    const workflows = pluginState?.workflowCounts || {};
    const recentNotifications = Array.isArray(pluginState?.notifications) ? pluginState.notifications.slice(0, 8) : [];

    const runAction = async (action, data) => {
      setBusy(true);
      setNote('');
      try {
        const result = await Promise.resolve(onAction?.(action, data));
        if (result?.ok === false && result?.error) {
          setNote(result.error);
        } else {
          setNote(action === 'run-doctor' ? 'Doctor checks refreshed.' : 'Refresh completed.');
        }
      } catch (error) {
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
        h(StatCard, { label: 'Tasks', value: fmtNumber(taskSummary.total), subvalue: `${fmtNumber(taskSummary.running)} running • ${fmtNumber(taskSummary.failed)} failed` }),
        h(StatCard, { label: 'Workers', value: fmtNumber(workerSummary.total), subvalue: `${fmtNumber(workerSummary.healthy)} healthy • ${fmtNumber(workerSummary.degraded)} degraded` }),
        h(StatCard, { label: 'Extensions', value: fmtNumber(dashboard?.extensionsCount || 0), subvalue: 'Loaded daemon extensions' }),
        h(StatCard, { label: 'Capabilities', value: fmtNumber((dashboard?.capabilities || []).length), subvalue: 'Natural-language router suggestions' }),
        h(StatCard, { label: 'Notifications', value: fmtNumber(pluginState?.unreadNotificationCount || 0), subvalue: `${fmtNumber((pluginState?.notifications || []).length)} retained` }),
        h(StatCard, { label: 'Workflows', value: fmtNumber(workflows.total || 0), subvalue: `${fmtNumber(workflows.active || 0)} active • ${fmtNumber(workflows.needsInput || 0)} needs input` }),
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
          recentNotifications.map((notification) => h(
            'div',
            { key: notification.id, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
            h('div', { className: 'flex flex-wrap items-center gap-2' },
              h('span', { className: 'text-sm font-medium' }, notification.title),
              h(Badge, { status: notification.severity }),
            ),
            h('div', { className: 'mt-1 text-xs text-muted-foreground' }, `${notification.type} • ${fmtAgo(notification.timestamp)}${notification.source ? ` • ${notification.source}` : ''}`),
            notification.message ? h('div', { className: 'mt-2 text-sm text-muted-foreground' }, notification.message) : null,
          )),
        )),
    );
  }

  function NotificationsView({ pluginState, onAction }) {
    const [filter, setFilter] = useState('all');
    const [expandedId, setExpandedId] = useState('');
    const notifications = Array.isArray(pluginState?.notifications) ? pluginState.notifications : [];
    const filtered = filter === 'all' ? notifications : notifications.filter((item) => item.severity === filter);

    const markRead = async (id) => {
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
        ['all', 'error', 'warn', 'success', 'info'].map((severity) => h(ActionButton, {
          key: severity,
          label: severity === 'all' ? `All (${notifications.length})` : `${severity} (${notifications.filter((item) => item.severity === severity).length})`,
          onClick: () => setFilter(severity),
          variant: filter === severity ? 'default' : 'secondary',
        })),
      ),
      filtered.length === 0
        ? h(EmptyState, { title: 'No notifications', body: 'Daemon events, proactive messages, and workflow alerts will appear here.' })
        : h(
          'div',
          { className: 'space-y-2' },
          filtered.map((notification) => h(NotificationRow, {
            key: notification.id,
            notification,
            expanded: expandedId === notification.id,
            onToggle: () => setExpandedId(expandedId === notification.id ? '' : notification.id),
            onRead: () => { void markRead(notification.id); },
          })),
        )),
    );
  }

  function OperationsView({ pluginState, onAction }) {
    const [input, setInput] = useState('');
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [apiPath, setApiPath] = useState('/api/settings');
    const [apiMethod, setApiMethod] = useState('GET');
    const [apiQuery, setApiQuery] = useState('{}');
    const [apiBody, setApiBody] = useState('{}');
    const [apiExpectText, setApiExpectText] = useState(false);
    const [apiBusy, setApiBusy] = useState(false);
    const [apiResult, setApiResult] = useState(null);
    const capabilities = Array.isArray(pluginState?.dashboard?.capabilities) ? pluginState.dashboard.capabilities : [];
    const filtered = input.trim()
      ? capabilities.filter((capability) => String(capability?.name || '').toLowerCase().includes(input.toLowerCase()) || String(capability?.description || '').toLowerCase().includes(input.toLowerCase())).slice(0, 8)
      : capabilities.slice(0, 8);

    const runCommand = async () => {
      if (!input.trim() || running) return;
      setRunning(true);
      try {
        const response = await Promise.resolve(onAction?.('execute-command', { input: input.trim() }));
        setResult(response);
      } catch (error) {
        setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      } finally {
        setRunning(false);
      }
    };

    const runApiRequest = async () => {
      if (!apiPath.trim()) return;
      const parsedQuery = parseJson(apiQuery, {});
      const parsedBody = parseJson(apiBody, {});
      if (parsedQuery == null || !parsedQuery || Array.isArray(parsedQuery)) {
        setApiResult({ ok: false, error: 'Query JSON must be an object.' });
        return;
      }
      if (apiMethod !== 'GET' && apiMethod !== 'DELETE' && (parsedBody == null || Array.isArray(parsedBody))) {
        setApiResult({ ok: false, error: 'Body JSON must be an object for write requests.' });
        return;
      }

      setApiBusy(true);
      try {
        const response = await Promise.resolve(onAction?.('daemon-call', {
          path: apiPath.trim(),
          method: apiMethod,
          query: parsedQuery,
          body: apiMethod === 'GET' || apiMethod === 'DELETE' ? undefined : parsedBody,
          expectText: apiExpectText,
        }));
        setApiResult(response);
      } catch (error) {
        setApiResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
      } finally {
        setApiBusy(false);
      }
    };

    const applyPreset = (path, method = 'GET', query = '{}', body = '{}', expectText = false) => {
      setApiPath(path);
      setApiMethod(method);
      setApiQuery(query);
      setApiBody(body);
      setApiExpectText(expectText);
    };

    return h(
      'div',
      { className: 'space-y-5' },
      h(Section, {
        title: 'Command Router',
        subtitle: 'Natural-language daemon commands backed by `/api/do`, plus quick access to workspace thread helpers.',
      },
      h('div', { className: 'grid gap-4 lg:grid-cols-[1.1fr_0.9fr]' },
        h(
          'div',
          { className: 'grid gap-4' },
          h(TextAreaField, {
            label: 'Command',
            value: input,
            onChange: setInput,
            placeholder: 'What would you like Legion to do?',
            rows: 4,
          }),
          h('div', { className: 'flex flex-wrap gap-2' },
            h(ActionButton, { label: running ? 'Running...' : 'Run Command', onClick: runCommand, disabled: running || !input.trim() }),
            h(ActionButton, { label: 'Create Workspace Thread', onClick: () => onAction?.('create-thread', { open: true }), variant: 'secondary' }),
            h(ActionButton, { label: 'Open Proactive Thread', onClick: () => onAction?.('open-proactive-thread'), variant: 'secondary' }),
          ),
        ),
        h(
          'div',
          { className: 'rounded-2xl border border-border/60 bg-background/45 p-4' },
          h('div', { className: 'text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground' }, 'Suggestions'),
          filtered.length === 0
            ? h('p', { className: 'mt-3 text-sm text-muted-foreground' }, 'No daemon capabilities available yet.')
            : h(
              'div',
              { className: 'mt-3 space-y-2' },
              filtered.map((capability, index) => h(
                'button',
                {
                  key: capability?.name || index,
                  type: 'button',
                  onClick: () => setInput(capability?.description || capability?.name || ''),
                  className: 'w-full rounded-2xl border border-border/60 bg-card/50 px-3 py-2 text-left transition-colors hover:bg-muted/50',
                },
                h('div', { className: 'text-sm font-medium' }, capability?.name || 'Capability'),
                capability?.description ? h('div', { className: 'mt-1 text-xs text-muted-foreground' }, capability.description) : null,
              )),
            ),
        ),
      )),
      h(Section, {
        title: 'Command Result',
        subtitle: 'Latest daemon routing response stored by the plugin.',
      },
      h(JsonBox, {
        value: result || pluginState?.lastCommandResult || null,
        emptyLabel: 'Run a command to populate this result pane.',
      })),
      h(Section, {
        title: 'Raw Daemon Explorer',
        subtitle: 'A direct route to the broader daemon API surface so settings, schedules, audit, transport, metrics, memory, triggers, and other endpoints remain reachable.',
      },
      h('div', { className: 'grid gap-4 lg:grid-cols-[0.65fr_0.35fr]' },
        h('div', { className: 'grid gap-4' },
          h('div', { className: 'grid gap-4 md:grid-cols-[1fr_140px]' },
            h(Field, { label: 'Path', value: apiPath, onChange: setApiPath, placeholder: '/api/settings' }),
            h(Field, { label: 'Method', value: apiMethod, onChange: (value) => setApiMethod(value.toUpperCase()), placeholder: 'GET' }),
          ),
          h(TextAreaField, { label: 'Query JSON', value: apiQuery, onChange: setApiQuery, placeholder: '{"count":"25"}', rows: 4 }),
          h(TextAreaField, { label: 'Body JSON', value: apiBody, onChange: setApiBody, placeholder: '{"key":"value"}', rows: 6 }),
          h(Toggle, { label: 'Expect Text Response', description: 'Enable this for endpoints like `/api/metrics` that return plain text instead of JSON.', checked: apiExpectText, onChange: setApiExpectText }),
          h('div', { className: 'flex flex-wrap gap-2' },
            h(ActionButton, { label: apiBusy ? 'Sending...' : 'Send Request', onClick: runApiRequest, disabled: apiBusy || !apiPath.trim() }),
            h(ActionButton, { label: 'Settings', onClick: () => applyPreset('/api/settings'), variant: 'secondary' }),
            h(ActionButton, { label: 'Schedules', onClick: () => applyPreset('/api/schedules'), variant: 'secondary' }),
            h(ActionButton, { label: 'Triggers', onClick: () => applyPreset('/api/triggers'), variant: 'secondary' }),
            h(ActionButton, { label: 'Memory Stats', onClick: () => applyPreset('/api/memory/stats'), variant: 'secondary' }),
            h(ActionButton, { label: 'Metrics', onClick: () => applyPreset('/api/metrics', 'GET', '{}', '{}', true), variant: 'secondary' }),
          ),
        ),
        h('div', { className: 'rounded-2xl border border-border/60 bg-background/45 p-4' },
          h('div', { className: 'text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground' }, 'Common Surfaces'),
          h('div', { className: 'mt-3 space-y-2 text-sm text-muted-foreground' },
            ['catalog', 'extensions', 'tasks', 'workers', 'schedules', 'audit', 'transport', 'prompts', 'webhooks', 'tenants', 'capacity', 'governance', 'rbac', 'nodes', 'memory', 'marketplace', 'github', 'gaia', 'metering', 'mesh', 'absorbers', 'structural_index', 'tool_audit', 'state_diff', 'sessions/search', 'triggers', 'llm/token_budget', 'llm/providers', 'llm/provider_layer', 'llm/context_curation/status'].map((label) => h('div', { key: label, className: 'rounded-xl border border-border/50 bg-card/50 px-3 py-2' }, `/api/${label}`)),
          ),
        ),
      ),
      h('div', null, h(JsonBox, { value: apiResult, emptyLabel: 'Send a daemon request to inspect the raw response here.' }))),
    );
  }

  return {
    DashboardView,
    NotificationsView,
    OperationsView,
  };
}
