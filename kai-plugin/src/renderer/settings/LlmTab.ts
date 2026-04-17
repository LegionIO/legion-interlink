/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect, useCallback } from '../lib/react.js';
import { cx, fmtNumber } from '../lib/utils.js';
import { Section, ActionButton, Field, Toggle, Badge, EmptyState, StatCard, SegmentTabs } from '../components/index.js';

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'providers', label: 'Providers' },
  { key: 'curation', label: 'Context Curation' },
  { key: 'debate', label: 'Debate' },
  { key: 'caching', label: 'Prompt Caching' },
  { key: 'budget', label: 'Token Budget' },
  { key: 'routing', label: 'Tier Routing' },
  { key: 'escalation', label: 'Escalation' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function get(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function pct(used: number | undefined, max: number | null | undefined): number | null {
  if (used == null || !max) return null;
  return Math.min(Math.round((used / max) * 100), 100);
}

function ProgressBar({ value, warn, danger }: { value: number | null; warn?: boolean; danger?: boolean }): any {
  if (value == null) return null;
  const color = danger ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-primary/70';
  return h('div', { className: 'relative h-1.5 w-full overflow-hidden rounded-full bg-muted/30' },
    h('div', { className: cx('h-full rounded-full transition-all', color), style: { width: `${value}%` } }),
  );
}

function SelectField({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; hint?: string;
}): any {
  return h('label', { className: 'grid gap-1.5' },
    h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
    h('select', {
      value, onChange: (e: any) => onChange(e.target.value),
      className: 'w-full rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/60',
    }, options.map(o => h('option', { key: o.value, value: o.value }, o.label))),
    hint ? h('span', { className: 'text-[10px] text-muted-foreground/60' }, hint) : null,
  );
}

function NumberField({ label, value, onChange, min, hint }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; hint?: string;
}): any {
  return h('label', { className: 'grid gap-1.5' },
    h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
    h('input', {
      type: 'number', value: String(value), min,
      onChange: (e: any) => onChange(Number(e.target.value)),
      className: 'w-full rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/60',
    }),
    hint ? h('span', { className: 'text-[10px] text-muted-foreground/60' }, hint) : null,
  );
}

function NullableNumberField({ label, value, onChange, min, hint }: {
  label: string; value: number | null; onChange: (v: number | null) => void; min?: number; hint?: string;
}): any {
  const [local, setLocal] = useState(value == null ? '' : String(value));
  useEffect(() => { setLocal(value == null ? '' : String(value)); }, [value]);
  return h('label', { className: 'grid gap-1.5' },
    h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
    h('input', {
      type: 'number', value: local, min, placeholder: '(off)',
      onChange: (e: any) => setLocal(e.target.value),
      onBlur: () => { const t = local.trim(); onChange(t === '' ? null : isNaN(Number(t)) ? null : Number(t)); },
      className: 'w-full rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/60',
    }),
    hint ? h('span', { className: 'text-[10px] text-muted-foreground/60' }, hint) : null,
  );
}

function SliderField({ label, value, onChange, min, max, step, leftLabel, rightLabel }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; leftLabel?: string; rightLabel?: string;
}): any {
  return h('div', { className: 'grid gap-1.5' },
    h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' },
      `${label}: ${value.toFixed(2)}`),
    h('input', {
      type: 'range', min, max, step, value,
      onChange: (e: any) => onChange(Number(e.target.value)),
      className: 'w-full accent-[var(--color-primary)]',
    }),
    (leftLabel || rightLabel) ? h('div', { className: 'flex justify-between text-[10px] text-muted-foreground/60' },
      h('span', null, leftLabel || ''), h('span', null, rightLabel || ''),
    ) : null,
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function LlmTab({ onAction }: { onAction: any }) {
  const [tab, setTab] = useState('providers');
  const [settings, setSettings] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [providerLayer, setProviderLayer] = useState<any>(null);
  const [budget, setBudget] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, p, pl, b] = await Promise.all([
        Promise.resolve(onAction?.('daemon-settings-get')),
        Promise.resolve(onAction?.('llm-providers')),
        Promise.resolve(onAction?.('llm-provider-layer')),
        Promise.resolve(onAction?.('llm-token-budget')),
      ]);
      if (s?.ok === false) { setError(s.error || 'Failed to load settings'); return; }
      setSettings(s?.data ?? s);
      const pArr = p?.data ?? p;
      setProviders(Array.isArray(pArr) ? pArr : []);
      setProviderLayer(pl?.data ?? pl);
      setBudget(b?.data ?? b);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [onAction]);

  useEffect(() => { void load(); }, [load]);

  // Shorthand to read a daemon setting path
  const cfg = (path: string, fallback?: any) => get(settings, path) ?? fallback;

  // Update a single daemon setting
  const update = async (key: string, value: any) => {
    await Promise.resolve(onAction?.('daemon-settings-update', { key, value }));
    // Optimistic local update
    setSettings((prev: any) => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev));
      const parts = key.split('.');
      let obj = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return copy;
    });
  };

  const resetBudget = async () => {
    await Promise.resolve(onAction?.('llm-token-budget-reset'));
    const b = await Promise.resolve(onAction?.('llm-token-budget'));
    setBudget(b?.data ?? b);
  };

  // ── Section renderers ────────────────────────────────────────────────────

  const renderProviders = () => {
    const pl = providerLayer || {};
    const mode = pl.mode ?? 'ruby_llm';
    return h('div', { className: 'grid gap-4' },
      // Mode badge row
      h('div', { className: 'flex items-center gap-3' },
        h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, 'Provider Mode'),
        h(Badge, { status: mode === 'auto' ? 'info' : mode === 'native' ? 'success' : 'online' }),
        h('span', { className: 'text-sm font-medium' }, mode),
      ),
      pl.fallbackToRubyLlm != null
        ? h('div', { className: 'text-xs text-muted-foreground' },
            `Fallback to ruby_llm: ${pl.fallbackToRubyLlm ? 'yes' : 'no'}`)
        : null,
      // Provider list
      h('h4', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mt-2' }, 'Registered Providers'),
      providers.length === 0
        ? h(EmptyState, { title: 'No providers', body: 'No LLM providers registered with the daemon.' })
        : h('div', { className: 'grid gap-2' }, providers.map((p: any, i: number) =>
            h('div', { key: p.id || p.name || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
              h('div', { className: 'min-w-0 flex-1' },
                h('span', { className: 'text-sm font-medium' }, p.name || p.id || p.provider),
                p.models != null ? h('span', { className: 'ml-2 text-xs text-muted-foreground' }, `${p.models} models`) : null,
              ),
              h(Badge, { status: p.status || (p.enabled !== false ? 'online' : 'disabled') }),
            ),
          )),
    );
  };

  const renderCuration = () => {
    const enabled = cfg('llm.context_curation.enabled', true);
    const mode = cfg('llm.context_curation.mode', 'heuristic');
    return h('div', { className: 'grid gap-3' },
      h(Toggle, { label: 'Enable context curation', description: 'Trim and compress the context window before each inference call.', checked: enabled,
        onChange: (v: boolean) => update('llm.context_curation.enabled', v) }),
      enabled ? h(SelectField, { label: 'Curation Mode', value: mode,
        onChange: (v: string) => update('llm.context_curation.mode', v),
        options: [
          { value: 'heuristic', label: 'Heuristic (fast, rule-based)' },
          { value: 'llm_assisted', label: 'LLM-assisted (slower, smarter)' },
        ] }) : null,
      enabled ? h(NumberField, { label: 'Tool Result Max Chars', value: cfg('llm.context_curation.tool_result_max_chars', 2000),
        onChange: (v: number) => update('llm.context_curation.tool_result_max_chars', v), min: 100,
        hint: 'Truncate tool results to this many characters before injection.' }) : null,
      enabled ? h(Toggle, { label: 'Thinking eviction', description: 'Evict thinking/scratchpad blocks from context.',
        checked: cfg('llm.context_curation.thinking_eviction', true),
        onChange: (v: boolean) => update('llm.context_curation.thinking_eviction', v) }) : null,
      enabled ? h(SliderField, { label: 'Dedup threshold', value: cfg('llm.context_curation.dedup_threshold', 0.85),
        onChange: (v: number) => update('llm.context_curation.dedup_threshold', v),
        min: 0.5, max: 1.0, step: 0.01, leftLabel: '0.50 (aggressive)', rightLabel: '1.00 (exact only)' }) : null,
      enabled ? h(NumberField, { label: 'Target Context Tokens', value: cfg('llm.context_curation.target_context_tokens', 40000),
        onChange: (v: number) => update('llm.context_curation.target_context_tokens', v), min: 1000,
        hint: 'Curation targets this token budget before each inference call.' }) : null,
    );
  };

  const renderDebate = () => {
    const enabled = cfg('llm.debate.enabled', false);
    const strategy = cfg('llm.debate.model_selection_strategy', 'rotate');
    return h('div', { className: 'grid gap-3' },
      h(Toggle, { label: 'Enable debate pipeline', description: 'Multi-model adversarial reasoning for higher-quality answers.',
        checked: enabled, onChange: (v: boolean) => update('llm.debate.enabled', v) }),
      enabled ? h('div', { className: 'grid grid-cols-2 gap-3' },
        h(NumberField, { label: 'Default Rounds', value: cfg('llm.debate.default_rounds', 1),
          onChange: (v: number) => update('llm.debate.default_rounds', v), min: 1 }),
        h(NumberField, { label: 'Max Rounds', value: cfg('llm.debate.max_rounds', 3),
          onChange: (v: number) => update('llm.debate.max_rounds', v), min: 1 }),
      ) : null,
      enabled ? h(SelectField, { label: 'Model Selection Strategy', value: strategy,
        onChange: (v: string) => update('llm.debate.model_selection_strategy', v),
        options: [
          { value: 'rotate', label: 'Rotate (cycle through available models)' },
          { value: 'fixed', label: 'Fixed (use configured models below)' },
        ] }) : null,
      enabled && strategy === 'fixed' ? h('div', { className: 'grid gap-3 rounded-2xl border border-border/60 bg-background/30 p-4' },
        h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, 'Role Models'),
        h(Field, { label: 'Advocate Model', value: cfg('llm.debate.advocate_model', ''),
          onChange: (v: string) => update('llm.debate.advocate_model', v), placeholder: 'e.g. claude-sonnet' }),
        h(Field, { label: 'Challenger Model', value: cfg('llm.debate.challenger_model', ''),
          onChange: (v: string) => update('llm.debate.challenger_model', v), placeholder: 'e.g. claude-opus' }),
        h(Field, { label: 'Judge Model', value: cfg('llm.debate.judge_model', ''),
          onChange: (v: string) => update('llm.debate.judge_model', v), placeholder: 'e.g. claude-sonnet' }),
        h('p', { className: 'text-[10px] text-muted-foreground/60' }, 'Leave blank to use the daemon default for that role.'),
      ) : null,
    );
  };

  const renderCaching = () => {
    const enabled = cfg('llm.prompt_caching.enabled', false);
    return h('div', { className: 'grid gap-3' },
      h(Toggle, { label: 'Enable prompt caching', description: 'Cache prompt prefixes to reduce latency and cost.',
        checked: enabled, onChange: (v: boolean) => update('llm.prompt_caching.enabled', v) }),
      enabled ? h(Toggle, { label: 'Cache system prompt', checked: cfg('llm.prompt_caching.cache_system_prompt', true),
        onChange: (v: boolean) => update('llm.prompt_caching.cache_system_prompt', v) }) : null,
      enabled ? h(Toggle, { label: 'Cache tool definitions', checked: cfg('llm.prompt_caching.cache_tools', true),
        onChange: (v: boolean) => update('llm.prompt_caching.cache_tools', v) }) : null,
      enabled ? h(Toggle, { label: 'Cache conversation prefix', checked: cfg('llm.prompt_caching.cache_conversation', true),
        onChange: (v: boolean) => update('llm.prompt_caching.cache_conversation', v) }) : null,
      enabled ? h(NumberField, { label: 'Min Token Threshold', value: cfg('llm.prompt_caching.min_tokens', 1000),
        onChange: (v: number) => update('llm.prompt_caching.min_tokens', v), min: 0,
        hint: 'Only cache blocks with at least this many tokens (Anthropic minimum: 1024).' }) : null,
      enabled ? h('div', { className: 'rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground' },
        '\u26A0 Scope is ephemeral -- cached content lives ~5 minutes. Requires provider support (Anthropic cache_control API).',
      ) : null,
    );
  };

  const renderBudget = () => {
    const sessionTokens = budget?.session_tokens ?? budget?.used ?? 0;
    const sessionMax = budget?.session_max ?? budget?.limit ?? null;
    const sessionWarn = budget?.session_warn ?? null;
    const dailyTokens = budget?.daily_tokens ?? 0;
    const dailyMax = budget?.daily_max ?? null;
    const sessionP = pct(sessionTokens, sessionMax);
    const dailyP = pct(dailyTokens, dailyMax);
    const sessionIsOver = sessionMax != null && sessionTokens >= sessionMax;
    const sessionIsWarn = sessionWarn != null && sessionTokens >= sessionWarn;
    const dailyIsOver = dailyMax != null && dailyTokens >= dailyMax;

    return h('div', { className: 'grid gap-4' },
      // Config fields
      h('div', { className: 'grid gap-3' },
        h(NullableNumberField, { label: 'Session Max Tokens', value: cfg('llm.token_budget.session_max_tokens', null),
          onChange: (v: number | null) => update('llm.token_budget.session_max_tokens', v), min: 1000,
          hint: 'Hard limit per session. Stops inference when reached.' }),
        h(NullableNumberField, { label: 'Session Warn Tokens', value: cfg('llm.token_budget.session_warn_tokens', null),
          onChange: (v: number | null) => update('llm.token_budget.session_warn_tokens', v), min: 1000,
          hint: 'Show a warning when session usage approaches this threshold.' }),
        h(NullableNumberField, { label: 'Daily Max Tokens', value: cfg('llm.token_budget.daily_max_tokens', null),
          onChange: (v: number | null) => update('llm.token_budget.daily_max_tokens', v), min: 1000,
          hint: 'Hard daily limit across all sessions. Resets at midnight UTC.' }),
      ),
      // Live usage
      h('h4', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mt-1' }, 'Current Usage'),
      budget ? h('div', { className: 'grid gap-3' },
        // Session usage
        h('div', { className: 'grid gap-1' },
          h('div', { className: 'flex items-center justify-between text-xs' },
            h('span', { className: 'text-muted-foreground' }, 'Session'),
            h('span', { className: cx(sessionIsOver ? 'text-red-500' : sessionIsWarn ? 'text-amber-500' : 'text-muted-foreground') },
              `${fmtNumber(sessionTokens)}${sessionMax ? ' / ' + fmtNumber(sessionMax) : ''} tok`,
              sessionP != null ? ` (${sessionP}%)` : '',
            ),
          ),
          h(ProgressBar, { value: sessionP, warn: sessionIsWarn, danger: sessionIsOver }),
        ),
        // Daily usage
        h('div', { className: 'grid gap-1' },
          h('div', { className: 'flex items-center justify-between text-xs' },
            h('span', { className: 'text-muted-foreground' }, 'Daily'),
            h('span', { className: cx(dailyIsOver ? 'text-red-500' : 'text-muted-foreground') },
              `${fmtNumber(dailyTokens)}${dailyMax ? ' / ' + fmtNumber(dailyMax) : ''} tok`,
              dailyP != null ? ` (${dailyP}%)` : '',
            ),
          ),
          h(ProgressBar, { value: dailyP, danger: dailyIsOver }),
        ),
        // Reset button
        h('div', null, h(ActionButton, { label: 'Reset Session Counter', onClick: resetBudget, variant: 'secondary' })),
      ) : h('p', { className: 'text-xs text-muted-foreground/60' }, 'Usage not available (daemon may be offline).'),
    );
  };

  const renderRouting = () => {
    const enabled = cfg('llm.tier_routing.enabled', true);
    const mappings: Record<string, string> = cfg('llm.tier_routing.custom_mappings', {}) || {};
    const entries = Object.entries(mappings);

    const [newKey, setNewKey] = useState('');
    const [newVal, setNewVal] = useState('');

    const add = () => {
      const k = newKey.trim(), v = newVal.trim();
      if (!k || !v) return;
      update('llm.tier_routing.custom_mappings', { ...mappings, [k]: v });
      setNewKey(''); setNewVal('');
    };
    const remove = (key: string) => {
      const next = { ...mappings }; delete next[key];
      update('llm.tier_routing.custom_mappings', next);
    };

    return h('div', { className: 'grid gap-3' },
      h(Toggle, { label: 'Enable tier routing', description: 'Map intent patterns to specific model tiers.',
        checked: enabled, onChange: (v: boolean) => update('llm.tier_routing.enabled', v) }),
      enabled ? h('div', { className: 'grid gap-2' },
        h('p', { className: 'text-xs text-muted-foreground' },
          'Custom mappings override daemon defaults. Keys are intent patterns, values are tier names or model IDs.'),
        entries.length === 0
          ? h('p', { className: 'text-xs text-muted-foreground/60 italic' }, 'No custom mappings -- using daemon defaults.')
          : h('div', { className: 'grid gap-1.5' }, entries.map(([k, v]) =>
              h('div', { key: k, className: 'flex items-center gap-2 rounded-2xl border border-border/60 bg-background/45 px-4 py-2' },
                h('span', { className: 'text-xs font-mono flex-1 truncate' }, k),
                h('span', { className: 'text-muted-foreground text-xs' }, '\u2192'),
                h('span', { className: 'text-xs font-mono flex-1 truncate text-primary' }, v),
                h('button', {
                  type: 'button', onClick: () => remove(k),
                  className: 'text-xs text-muted-foreground hover:text-red-500 transition-colors shrink-0',
                }, '\u00D7'),
              ),
            )),
        // Add row
        h('div', { className: 'flex items-center gap-2' },
          h('input', {
            type: 'text', value: newKey, placeholder: 'intent pattern',
            onChange: (e: any) => setNewKey(e.target.value),
            className: 'flex-1 rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-xs font-mono outline-none',
          }),
          h('span', { className: 'text-muted-foreground text-xs shrink-0' }, '\u2192'),
          h('input', {
            type: 'text', value: newVal, placeholder: 'tier / model',
            onChange: (e: any) => setNewVal(e.target.value),
            onKeyDown: (e: any) => { if (e.key === 'Enter') add(); },
            className: 'flex-1 rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-xs font-mono outline-none',
          }),
          h(ActionButton, { label: '+ Add', onClick: add, variant: 'secondary' }),
        ),
      ) : null,
    );
  };

  const renderEscalation = () => {
    const enabled = cfg('llm.escalation.enabled', true);
    const pipeline = cfg('llm.escalation.pipeline_enabled', true);
    return h('div', { className: 'grid gap-3' },
      h(Toggle, { label: 'Enable escalation', description: 'Automatically escalate to higher-tier models on low-quality responses.',
        checked: enabled, onChange: (v: boolean) => update('llm.escalation.enabled', v) }),
      enabled ? h(Toggle, { label: 'Enable escalation pipeline', description: 'Multi-step quality scoring before escalation decision.',
        checked: pipeline, onChange: (v: boolean) => update('llm.escalation.pipeline_enabled', v) }) : null,
      enabled ? h('p', { className: 'text-xs text-muted-foreground' },
        'When a response scores below the quality threshold, it is automatically re-run with a higher-tier model. Thresholds are configured in the daemon LLM routing settings.',
      ) : null,
    );
  };

  // ── Tab dispatch ─────────────────────────────────────────────────────────

  const renderContent = () => {
    if (loading) return h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...');
    if (error) return h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error);
    switch (tab) {
      case 'providers': return renderProviders();
      case 'curation': return renderCuration();
      case 'debate': return renderDebate();
      case 'caching': return renderCaching();
      case 'budget': return renderBudget();
      case 'routing': return renderRouting();
      case 'escalation': return renderEscalation();
      default: return null;
    }
  };

  return h(Section, {
    title: 'LLM Pipeline',
    subtitle: 'Providers, context curation, debate, caching, budgets, routing, and escalation',
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    h('div', { className: 'grid gap-4' },
      h(SegmentTabs, { tabs: TABS, active: tab, onChange: setTab }),
      renderContent(),
    ),
  );
}
