/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState } from '../lib/react.js';
import { parseJson } from '../lib/utils.js';
import { Section, ActionButton, Field, TextAreaField, Toggle, JsonBox } from '../components/index.js';

export function OperationsView({ pluginState, onAction }: any): any {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [apiPath, setApiPath] = useState('/api/settings');
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiQuery, setApiQuery] = useState('{}');
  const [apiBody, setApiBody] = useState('{}');
  const [apiExpectText, setApiExpectText] = useState(false);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiResult, setApiResult] = useState<any>(null);
  const capabilities = Array.isArray(pluginState?.dashboard?.capabilities) ? pluginState.dashboard.capabilities : [];
  const filtered = input.trim()
    ? capabilities.filter((capability: any) => String(capability?.name || '').toLowerCase().includes(input.toLowerCase()) || String(capability?.description || '').toLowerCase().includes(input.toLowerCase())).slice(0, 8)
    : capabilities.slice(0, 8);

  const runCommand = async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    try {
      const response = await Promise.resolve(onAction?.('execute-command', { input: input.trim() }));
      setResult(response);
    } catch (error: any) {
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
    } catch (error: any) {
      setApiResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setApiBusy(false);
    }
  };

  const applyPreset = (path: string, method = 'GET', query = '{}', body = '{}', expectText = false) => {
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
            filtered.map((capability: any, index: number) => h(
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
          h(Field, { label: 'Method', value: apiMethod, onChange: (value: string) => setApiMethod(value.toUpperCase()), placeholder: 'GET' }),
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
