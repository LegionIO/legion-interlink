export function createRendererContext(api) {
  const { React } = api;
  const h = React.createElement;
  const { useEffect, useMemo, useState } = React;

  function getBridge() {
    return window.app ?? null;
  }

  function cx(...parts) {
    return parts.filter(Boolean).join(' ');
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function parseJson(text, fallback) {
    try {
      return text.trim() ? JSON.parse(text) : fallback;
    } catch {
      return null;
    }
  }

  function asArray(value, nestedKey) {
    if (Array.isArray(value)) return value;
    if (nestedKey && value && typeof value === 'object' && Array.isArray(value[nestedKey])) {
      return value[nestedKey];
    }
    if (value && typeof value === 'object') {
      for (const key of ['items', 'results', 'data', 'entries', 'records', 'repos', 'pulls', 'issues', 'commits', 'monitors']) {
        if (Array.isArray(value[key])) return value[key];
      }
    }
    return [];
  }

  function fmtAgo(iso) {
    if (!iso) return 'never';
    const diffMs = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diffMs)) return iso;
    if (diffMs < 60_000) return 'now';
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h`;
    return `${Math.floor(diffMs / 86_400_000)}d`;
  }

  function fmtTime(iso) {
    if (!iso) return 'never';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function fmtUptime(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'n/a';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
    return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3_600)}h`;
  }

  function fmtNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
    if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
    return String(number);
  }

  function fmtCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'n/a';
    return `$${number.toFixed(2)}`;
  }

  function Badge({ status }) {
    const palette = {
      online: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      offline: 'bg-red-500/10 text-red-700 dark:text-red-300',
      checking: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
      unconfigured: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      disabled: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
      success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      info: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
      warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      error: 'bg-red-500/10 text-red-700 dark:text-red-300',
      pending: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
      running: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
      'needs-input': 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      resolved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      failed: 'bg-red-500/10 text-red-700 dark:text-red-300',
      unknown: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    };
    const label = status || 'unknown';
    return h(
      'span',
      {
        className: cx(
          'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
          palette[label] || palette.unknown,
        ),
      },
      label,
    );
  }

  function Section({ title, subtitle, actions, children }) {
    return h(
      'section',
      { className: 'rounded-3xl border border-border/70 bg-card/70 p-5 shadow-sm' },
      h(
        'div',
        { className: 'mb-4 flex flex-wrap items-start justify-between gap-3' },
        h(
          'div',
          null,
          h('h3', { className: 'text-sm font-semibold' }, title),
          subtitle ? h('p', { className: 'mt-1 text-xs text-muted-foreground' }, subtitle) : null,
        ),
        actions ? h('div', { className: 'flex flex-wrap gap-2' }, actions) : null,
      ),
      children,
    );
  }

  function ActionButton({ label, onClick, disabled, variant = 'default' }) {
    const classes = variant === 'secondary'
      ? 'border border-border/70 bg-card/60 text-foreground hover:bg-muted/50'
      : variant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-600/90'
        : 'bg-primary text-primary-foreground hover:bg-primary/90';
    return h(
      'button',
      {
        type: 'button',
        onClick,
        disabled,
        className: cx(
          'rounded-2xl px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          classes,
        ),
      },
      label,
    );
  }

  function Field({ label, value, onChange, placeholder, type = 'text' }) {
    return h(
      'label',
      { className: 'grid gap-1.5' },
      h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
      h('input', {
        type,
        value,
        onChange: (event) => onChange(event.target.value),
        placeholder,
        className: 'w-full rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/60',
      }),
    );
  }

  function TextAreaField({ label, value, onChange, placeholder, rows = 5 }) {
    return h(
      'label',
      { className: 'grid gap-1.5' },
      h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
      h('textarea', {
        value,
        onChange: (event) => onChange(event.target.value),
        placeholder,
        rows,
        className: 'min-h-[120px] w-full rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/60',
      }),
    );
  }

  function Toggle({ label, description, checked, onChange }) {
    return h(
      'label',
      { className: 'flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
      h(
        'div',
        { className: 'min-w-0' },
        h('div', { className: 'text-sm font-medium' }, label),
        h('p', { className: 'mt-1 text-xs text-muted-foreground' }, description),
      ),
      h('input', {
        type: 'checkbox',
        checked,
        onChange: (event) => onChange(event.target.checked),
        className: 'mt-1 h-4 w-4 rounded border-border',
      }),
    );
  }

  function StatCard({ label, value, subvalue }) {
    return h(
      'div',
      { className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
      h('div', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
      h('div', { className: 'mt-1 text-xl font-semibold tracking-tight' }, value),
      subvalue ? h('div', { className: 'mt-1 text-xs text-muted-foreground' }, subvalue) : null,
    );
  }

  function JsonBox({ value, emptyLabel = 'No data yet.' }) {
    const text = useMemo(() => {
      if (value == null || value === '') return '';
      return safeJson(value);
    }, [value]);

    if (!text) {
      return h('p', { className: 'text-sm text-muted-foreground' }, emptyLabel);
    }

    return h(
      'pre',
      {
        className: 'max-h-[420px] overflow-auto rounded-2xl border border-border/60 bg-background/55 p-4 text-xs text-foreground/90',
      },
      text,
    );
  }

  function EmptyState({ title, body }) {
    return h(
      'div',
      { className: 'rounded-3xl border border-dashed border-border/70 bg-card/25 px-6 py-12 text-center' },
      h('div', { className: 'text-sm font-medium' }, title),
      h('p', { className: 'mt-2 text-sm text-muted-foreground' }, body),
    );
  }

  function KeyValueGrid({ items }) {
    return h(
      'div',
      { className: 'grid gap-3 md:grid-cols-2 xl:grid-cols-3' },
      items.map(([label, value]) => h(
        'div',
        {
          key: label,
          className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3',
        },
        h('div', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
        h('div', { className: 'mt-1 break-all text-sm font-medium' }, value),
      )),
    );
  }

  function SegmentTabs({ tabs, active, onChange }) {
    return h(
      'div',
      { className: 'flex flex-wrap gap-2' },
      tabs.map((tab) => h(
        'button',
        {
          key: tab.key,
          type: 'button',
          onClick: () => onChange(tab.key),
          className: cx(
            'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            active === tab.key
              ? 'bg-primary text-primary-foreground'
              : 'border border-border/70 bg-card/40 text-muted-foreground hover:text-foreground',
          ),
        },
        tab.label,
      )),
    );
  }

  function NotificationRow({ notification, expanded, onToggle, onRead }) {
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
          h('p', { className: 'mt-1 text-xs text-muted-foreground' }, `${notification.type} • ${fmtAgo(notification.timestamp)}${notification.source ? ` • ${notification.source}` : ''}`),
          notification.message && !expanded
            ? h('p', { className: 'mt-2 truncate text-sm text-muted-foreground' }, notification.message)
            : null,
        ),
        h('span', { className: 'text-xs text-muted-foreground' }, expanded ? 'Hide' : 'Show'),
      ),
      expanded ? h(
        'div',
        { className: 'border-t border-border/50 px-4 py-3' },
        notification.message ? h('p', { className: 'whitespace-pre-wrap text-sm text-muted-foreground' }, notification.message) : null,
        h('div', { className: 'mt-3 text-[11px] text-muted-foreground' }, fmtTime(notification.timestamp)),
        h('details', { className: 'mt-3' },
          h('summary', { className: 'cursor-pointer text-xs text-muted-foreground' }, 'Raw event'),
          h(JsonBox, { value: notification.raw, emptyLabel: 'No raw payload.' }),
        ),
      ) : null,
    );
  }

  function useDraftConfig(pluginConfig) {
    const [draft, setDraft] = useState(() => buildDraft(pluginConfig));

    useEffect(() => {
      setDraft(buildDraft(pluginConfig));
    }, [
      pluginConfig?.enabled,
      pluginConfig?.daemonUrl,
      pluginConfig?.configDir,
      pluginConfig?.apiKey,
      pluginConfig?.readyPath,
      pluginConfig?.healthPath,
      pluginConfig?.streamPath,
      pluginConfig?.eventsPath,
      pluginConfig?.backendEnabled,
      pluginConfig?.daemonStreaming,
      pluginConfig?.notificationsEnabled,
      pluginConfig?.nativeNotifications,
      pluginConfig?.autoConnectEvents,
      pluginConfig?.openProactiveThread,
      pluginConfig?.healthPollMs,
      pluginConfig?.eventsRecentCount,
      pluginConfig?.sseReconnectMs,
      pluginConfig?.workspaceThreadTitle,
      pluginConfig?.proactiveThreadTitle,
      pluginConfig?.bootstrapPrompt,
      pluginConfig?.proactivePromptPrefix,
      pluginConfig?.knowledgeRagEnabled,
      pluginConfig?.knowledgeCaptureEnabled,
      pluginConfig?.knowledgeScope,
      pluginConfig?.triggersEnabled,
      pluginConfig?.autoTriage,
      pluginConfig?.triageModel,
      pluginConfig?.maxConcurrentWorkflows,
      safeJson(pluginConfig?.triggerRules || []),
    ]);

    return [draft, setDraft];
  }

  function buildDraft(pluginConfig) {
    return {
      enabled: pluginConfig?.enabled !== false,
      daemonUrl: pluginConfig?.daemonUrl || 'http://127.0.0.1:4567',
      configDir: pluginConfig?.configDir || '',
      apiKey: pluginConfig?.apiKey || '',
      readyPath: pluginConfig?.readyPath || '/api/ready',
      healthPath: pluginConfig?.healthPath || '/api/health',
      streamPath: pluginConfig?.streamPath || '/api/llm/inference',
      eventsPath: pluginConfig?.eventsPath || '/api/events',
      backendEnabled: pluginConfig?.backendEnabled !== false,
      daemonStreaming: pluginConfig?.daemonStreaming !== false,
      notificationsEnabled: pluginConfig?.notificationsEnabled !== false,
      nativeNotifications: pluginConfig?.nativeNotifications !== false,
      autoConnectEvents: pluginConfig?.autoConnectEvents !== false,
      openProactiveThread: Boolean(pluginConfig?.openProactiveThread),
      healthPollMs: String(pluginConfig?.healthPollMs || 60000),
      eventsRecentCount: String(pluginConfig?.eventsRecentCount || 50),
      sseReconnectMs: String(pluginConfig?.sseReconnectMs || 5000),
      workspaceThreadTitle: pluginConfig?.workspaceThreadTitle || 'Legion Workspace',
      proactiveThreadTitle: pluginConfig?.proactiveThreadTitle || 'GAIA Activity',
      bootstrapPrompt: pluginConfig?.bootstrapPrompt || '',
      proactivePromptPrefix: pluginConfig?.proactivePromptPrefix || 'Proactive daemon activity',
      knowledgeRagEnabled: pluginConfig?.knowledgeRagEnabled !== false,
      knowledgeCaptureEnabled: pluginConfig?.knowledgeCaptureEnabled !== false,
      knowledgeScope: pluginConfig?.knowledgeScope || 'all',
      triggersEnabled: pluginConfig?.triggersEnabled !== false,
      autoTriage: pluginConfig?.autoTriage !== false,
      triageModel: pluginConfig?.triageModel || '',
      maxConcurrentWorkflows: String(pluginConfig?.maxConcurrentWorkflows || 3),
      triggerRules: safeJson(pluginConfig?.triggerRules || []),
    };
  }

  return {
    React,
    h,
    useEffect,
    useMemo,
    useState,
    getBridge,
    cx,
    safeJson,
    parseJson,
    asArray,
    fmtAgo,
    fmtTime,
    fmtUptime,
    fmtNumber,
    fmtCurrency,
    Badge,
    Section,
    ActionButton,
    Field,
    TextAreaField,
    Toggle,
    StatCard,
    JsonBox,
    EmptyState,
    KeyValueGrid,
    SegmentTabs,
    NotificationRow,
    useDraftConfig,
  };
}
