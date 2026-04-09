export function createLegionSettings(context) {
  const {
    h,
    useState,
    useDraftConfig,
    parseJson,
    Badge,
    Section,
    ActionButton,
    Field,
    TextAreaField,
    Toggle,
    KeyValueGrid,
  } = context;

  return function LegionSettings({ pluginState, pluginConfig, setPluginConfig, onAction }) {
    const [draft, setDraft] = useDraftConfig(pluginConfig);
    const [saving, setSaving] = useState(false);
    const [working, setWorking] = useState(false);
    const [note, setNote] = useState('');

    const runAction = async (action, data) => {
      setWorking(true);
      setNote('');
      try {
        const result = await Promise.resolve(onAction?.(action, data));
        if (result?.ok === false && result?.error) {
          setNote(result.error);
        } else {
          setNote('Action completed.');
        }
      } catch (error) {
        setNote(error instanceof Error ? error.message : String(error));
      } finally {
        setWorking(false);
      }
    };

    const saveDraft = async () => {
      if (!setPluginConfig) return;
      const parsedRules = parseJson(draft.triggerRules, []);
      if (parsedRules == null || !Array.isArray(parsedRules)) {
        setNote('Trigger rules must be valid JSON array data.');
        return;
      }

      setSaving(true);
      setNote('');
      try {
        await setPluginConfig('enabled', draft.enabled);
        await setPluginConfig('daemonUrl', draft.daemonUrl.trim());
        await setPluginConfig('configDir', draft.configDir.trim());
        await setPluginConfig('apiKey', draft.apiKey);
        await setPluginConfig('readyPath', draft.readyPath.trim() || '/api/ready');
        await setPluginConfig('healthPath', draft.healthPath.trim() || '/api/health');
        await setPluginConfig('streamPath', draft.streamPath.trim() || '/api/llm/inference');
        await setPluginConfig('eventsPath', draft.eventsPath.trim() || '/api/events');
        await setPluginConfig('backendEnabled', draft.backendEnabled);
        await setPluginConfig('daemonStreaming', draft.daemonStreaming);
        await setPluginConfig('notificationsEnabled', draft.notificationsEnabled);
        await setPluginConfig('nativeNotifications', draft.nativeNotifications);
        await setPluginConfig('autoConnectEvents', draft.autoConnectEvents);
        await setPluginConfig('openProactiveThread', draft.openProactiveThread);
        await setPluginConfig('healthPollMs', Math.max(Number(draft.healthPollMs) || 60000, 15000));
        await setPluginConfig('eventsRecentCount', Math.max(Number(draft.eventsRecentCount) || 50, 1));
        await setPluginConfig('sseReconnectMs', Math.max(Number(draft.sseReconnectMs) || 5000, 2000));
        await setPluginConfig('workspaceThreadTitle', draft.workspaceThreadTitle.trim() || 'Legion Workspace');
        await setPluginConfig('proactiveThreadTitle', draft.proactiveThreadTitle.trim() || 'GAIA Activity');
        await setPluginConfig('bootstrapPrompt', draft.bootstrapPrompt);
        await setPluginConfig('proactivePromptPrefix', draft.proactivePromptPrefix.trim() || 'Proactive daemon activity');
        await setPluginConfig('knowledgeRagEnabled', draft.knowledgeRagEnabled);
        await setPluginConfig('knowledgeCaptureEnabled', draft.knowledgeCaptureEnabled);
        await setPluginConfig('knowledgeScope', draft.knowledgeScope);
        await setPluginConfig('triggersEnabled', draft.triggersEnabled);
        await setPluginConfig('autoTriage', draft.autoTriage);
        await setPluginConfig('triageModel', draft.triageModel.trim());
        await setPluginConfig('maxConcurrentWorkflows', Math.max(Number(draft.maxConcurrentWorkflows) || 3, 1));
        await setPluginConfig('triggerRules', parsedRules);
        setNote('Legion config saved.');
      } catch (error) {
        setNote(error instanceof Error ? error.message : String(error));
      } finally {
        setSaving(false);
      }
    };

    const summaryItems = [
      ['Status', pluginState?.status || 'unknown'],
      ['Daemon URL', pluginState?.serviceUrl || draft.daemonUrl || 'not set'],
      ['Auth Source', pluginState?.authSource || 'none'],
      ['Config Dir', pluginState?.resolvedConfigDir || draft.configDir || 'auto-detect'],
      ['Events', pluginState?.eventsConnected ? 'connected' : 'disconnected'],
      ['Unread Notifications', String(pluginState?.unreadNotificationCount || 0)],
      ['Managed Threads', String((pluginState?.managedConversationIds || []).length)],
      ['Workflows', String(pluginState?.workflowCounts?.total || 0)],
    ];

    return h(
      'div',
      { className: 'space-y-5' },
      h('div', { className: 'flex items-center gap-3' },
        h('h2', { className: 'text-lg font-semibold' }, 'Legion'),
        h(Badge, { status: pluginState?.status }),
      ),
      note ? h('div', { className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3 text-sm' }, note) : null,
      h(Section, {
        title: 'Connection',
        subtitle: 'Configure the Legion daemon, auth source, and event transport.',
      },
      h('div', { className: 'grid gap-4 md:grid-cols-2' },
        h(Field, { label: 'Daemon URL', value: draft.daemonUrl, onChange: (value) => setDraft((current) => ({ ...current, daemonUrl: value })), placeholder: 'http://127.0.0.1:4567' }),
        h(Field, { label: 'Config Dir', value: draft.configDir, onChange: (value) => setDraft((current) => ({ ...current, configDir: value })), placeholder: '~/.kai/settings' }),
        h(Field, { label: 'API Key', value: draft.apiKey, onChange: (value) => setDraft((current) => ({ ...current, apiKey: value })), type: 'password', placeholder: 'Optional manual bearer token' }),
        h(Field, { label: 'Ready Path', value: draft.readyPath, onChange: (value) => setDraft((current) => ({ ...current, readyPath: value })), placeholder: '/api/ready' }),
        h(Field, { label: 'Health Path', value: draft.healthPath, onChange: (value) => setDraft((current) => ({ ...current, healthPath: value })), placeholder: '/api/health' }),
        h(Field, { label: 'Stream Path', value: draft.streamPath, onChange: (value) => setDraft((current) => ({ ...current, streamPath: value })), placeholder: '/api/llm/inference' }),
        h(Field, { label: 'Events Path', value: draft.eventsPath, onChange: (value) => setDraft((current) => ({ ...current, eventsPath: value })), placeholder: '/api/events' }),
        h(Field, { label: 'Health Poll (ms)', value: draft.healthPollMs, onChange: (value) => setDraft((current) => ({ ...current, healthPollMs: value })), placeholder: '60000' }),
        h(Field, { label: 'Recent Events Count', value: draft.eventsRecentCount, onChange: (value) => setDraft((current) => ({ ...current, eventsRecentCount: value })), placeholder: '50' }),
        h(Field, { label: 'Reconnect Delay (ms)', value: draft.sseReconnectMs, onChange: (value) => setDraft((current) => ({ ...current, sseReconnectMs: value })), placeholder: '5000' }),
      )),
      h(Section, {
        title: 'Behavior',
        subtitle: 'Control backend registration, notifications, proactive thread behavior, and workflow routing.',
      },
      h('div', { className: 'grid gap-3' },
        h(Toggle, { label: 'Plugin Enabled', description: 'Turn Legion runtime features on or off without removing the plugin.', checked: draft.enabled, onChange: (checked) => setDraft((current) => ({ ...current, enabled: checked })) }),
        h(Toggle, { label: 'Legion Backend', description: 'Register the plugin-provided daemon backend for Legion-managed conversations.', checked: draft.backendEnabled, onChange: (checked) => setDraft((current) => ({ ...current, backendEnabled: checked })) }),
        h(Toggle, { label: 'Daemon Streaming', description: 'Prefer daemon SSE streaming for chat requests, with sync and task fallback when needed.', checked: draft.daemonStreaming, onChange: (checked) => setDraft((current) => ({ ...current, daemonStreaming: checked })) }),
        h(Toggle, { label: 'Notifications', description: 'Allow Legion to surface toast and native notifications for daemon events.', checked: draft.notificationsEnabled, onChange: (checked) => setDraft((current) => ({ ...current, notificationsEnabled: checked })) }),
        h(Toggle, { label: 'Native Notifications', description: 'Send native OS notifications for high-signal daemon events when Legion fires alerts.', checked: draft.nativeNotifications, onChange: (checked) => setDraft((current) => ({ ...current, nativeNotifications: checked })) }),
        h(Toggle, { label: 'Event Stream', description: 'Keep a live SSE connection open for daemon notifications, trigger routing, and proactive activity.', checked: draft.autoConnectEvents, onChange: (checked) => setDraft((current) => ({ ...current, autoConnectEvents: checked })) }),
        h(Toggle, { label: 'Auto-open Proactive Thread', description: 'Bring the GAIA/proactive conversation to the foreground when new proactive events arrive.', checked: draft.openProactiveThread, onChange: (checked) => setDraft((current) => ({ ...current, openProactiveThread: checked })) }),
        h(Toggle, { label: 'Knowledge RAG', description: 'Forward daemon knowledge retrieval flags through the Legion backend adapter.', checked: draft.knowledgeRagEnabled, onChange: (checked) => setDraft((current) => ({ ...current, knowledgeRagEnabled: checked })) }),
        h(Toggle, { label: 'Knowledge Capture', description: 'Allow the Legion backend adapter to request knowledge capture during daemon inference.', checked: draft.knowledgeCaptureEnabled, onChange: (checked) => setDraft((current) => ({ ...current, knowledgeCaptureEnabled: checked })) }),
        h(Toggle, { label: 'Trigger Routing', description: 'Route trigger.* daemon events into observe/act workflow handling inside the plugin.', checked: draft.triggersEnabled, onChange: (checked) => setDraft((current) => ({ ...current, triggersEnabled: checked })) }),
        h(Toggle, { label: 'Auto Triage', description: 'Default unmatched trigger events to observe unless a rule says otherwise.', checked: draft.autoTriage, onChange: (checked) => setDraft((current) => ({ ...current, autoTriage: checked })) }),
      )),
      h(Section, {
        title: 'Threads And Rules',
        subtitle: 'Adjust workflow policy, conversation defaults, and proactive thread copy.',
      },
      h('div', { className: 'grid gap-4 md:grid-cols-2' },
        h(Field, { label: 'Workspace Title', value: draft.workspaceThreadTitle, onChange: (value) => setDraft((current) => ({ ...current, workspaceThreadTitle: value })), placeholder: 'Legion Workspace' }),
        h(Field, { label: 'Proactive Title', value: draft.proactiveThreadTitle, onChange: (value) => setDraft((current) => ({ ...current, proactiveThreadTitle: value })), placeholder: 'GAIA Activity' }),
        h(Field, { label: 'Knowledge Scope', value: draft.knowledgeScope, onChange: (value) => setDraft((current) => ({ ...current, knowledgeScope: value })), placeholder: 'all' }),
        h(Field, { label: 'Triage Model', value: draft.triageModel, onChange: (value) => setDraft((current) => ({ ...current, triageModel: value })), placeholder: 'Optional model override' }),
        h(Field, { label: 'Max Concurrent Workflows', value: draft.maxConcurrentWorkflows, onChange: (value) => setDraft((current) => ({ ...current, maxConcurrentWorkflows: value })), placeholder: '3' }),
      ),
      h(TextAreaField, { label: 'Bootstrap Prompt', value: draft.bootstrapPrompt, onChange: (value) => setDraft((current) => ({ ...current, bootstrapPrompt: value })), placeholder: 'Assistant bootstrap message for new Legion threads', rows: 5 }),
      h(TextAreaField, { label: 'Proactive Prompt Prefix', value: draft.proactivePromptPrefix, onChange: (value) => setDraft((current) => ({ ...current, proactivePromptPrefix: value })), placeholder: 'Prefix text for proactive messages', rows: 3 }),
      h(TextAreaField, { label: 'Trigger Rules JSON', value: draft.triggerRules, onChange: (value) => setDraft((current) => ({ ...current, triggerRules: value })), placeholder: '[{\"source\":\"github\",\"eventType\":\"*\",\"action\":\"observe\"}]', rows: 8 }),
      h('div', { className: 'mt-4 flex flex-wrap gap-2' },
        h(ActionButton, { label: saving ? 'Saving...' : 'Save Config', onClick: saveDraft, disabled: saving }),
        h(ActionButton, { label: working ? 'Working...' : 'Refresh Status', onClick: () => runAction('refresh-status'), disabled: working, variant: 'secondary' }),
        h(ActionButton, { label: 'Run Doctor', onClick: () => runAction('run-doctor'), disabled: working, variant: 'secondary' }),
        h(ActionButton, { label: 'Open Proactive Thread', onClick: () => runAction('open-proactive-thread'), disabled: working, variant: 'secondary' }),
      )),
      h(Section, {
        title: 'Runtime Snapshot',
        subtitle: 'Live Legion plugin state published from the host process.',
      },
      h(KeyValueGrid, { items: summaryItems })),
      h(Section, {
        title: 'Doctor Results',
        subtitle: 'Most recent daemon diagnostics collected from the plugin.',
      },
      Array.isArray(pluginState?.doctorResults) && pluginState.doctorResults.length > 0
        ? h(
          'div',
          { className: 'space-y-2' },
          pluginState.doctorResults.map((entry) => h(
            'div',
            { key: `${entry.name}-${entry.duration}`, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
            h('div', { className: 'flex items-center justify-between gap-3' },
              h('span', { className: 'text-sm font-medium' }, entry.name),
              h(Badge, { status: entry.status === 'pass' ? 'success' : entry.status }),
            ),
            h('p', { className: 'mt-1 text-xs text-muted-foreground' }, entry.message),
            h('p', { className: 'mt-2 text-[11px] text-muted-foreground' }, `${entry.duration}ms`),
          )),
        )
        : h('p', { className: 'text-sm text-muted-foreground' }, 'Run the doctor from settings or Mission Control to populate these checks.')),
    );
  };
}
