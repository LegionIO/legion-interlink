/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect, useCallback, useMemo, useRef } from '../lib/react.js';
import { cx, asArray } from '../lib/utils.js';
import { Section, ActionButton } from '../components/index.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL = 3000;

const ACTIVE_PHASES = [
  'sensory_processing', 'emotional_evaluation', 'gut_instinct', 'memory_retrieval',
  'working_memory_integration', 'action_selection', 'prediction_engine', 'social_cognition',
  'theory_of_mind', 'homeostasis_regulation', 'identity_entropy_check', 'post_tick_reflection',
  'knowledge_retrieval', 'knowledge_promotion', 'procedural_check', 'mesh_interface',
] as const;

const DREAM_PHASES = [
  'dream_onset', 'dream_narrative', 'dream_emotion', 'dream_consolidation',
  'dream_creativity', 'dream_rehearsal', 'dream_integration', 'dream_emergence',
] as const;

const MODE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  dormant:        { color: 'text-gray-400',    bg: 'bg-gray-500/10',    label: '\u23F8 Dormant' },
  sentinel:       { color: 'text-amber-400',   bg: 'bg-amber-500/10',   label: '\u{1F441} Sentinel' },
  full_active:    { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '\u26A1 Full Active' },
  dormant_active: { color: 'text-violet-400',  bg: 'bg-violet-500/10',  label: '\u263E Dormant Active' },
};

const MODE_SVG_COLOR: Record<string, string> = {
  dormant: '#737373',
  sentinel: '#f59e0b',
  full_active: '#34d399',
  dormant_active: '#a78bfa',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatPhaseName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function phaseColor(status: string): string {
  switch (status) {
    case 'running': return '#34d399';
    case 'completed': return '#6ee7b7';
    case 'skipped': return 'transparent';
    default: return '#525252';
  }
}

function phaseStroke(status: string): string {
  return status === 'skipped' ? '#525252' : 'none';
}

function phaseDash(status: string): string {
  return status === 'skipped' ? '3,3' : 'none';
}

function formatSecondsAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/* ------------------------------------------------------------------ */
/*  Phase Wheel (inline SVG component)                                */
/* ------------------------------------------------------------------ */

function renderPhaseWheel(
  phases: any[],
  tickMode: string,
  tickCount: number,
  hoveredPhase: any,
  setHoveredPhase: (p: any) => void,
  tooltipPos: { x: number; y: number },
  setTooltipPos: (p: { x: number; y: number }) => void,
) {
  const cxVal = 200;
  const cyVal = 200;
  const outerR = 160;
  const innerR = 100;
  const nodeR = 12;
  const innerNodeR = 9;

  const phaseMap = new Map(phases.map((p: any) => [p.name, p]));

  // Build outer ring nodes (active phases)
  const outerNodes = ACTIVE_PHASES.map((name, i) => {
    const angle = (i / ACTIVE_PHASES.length) * Math.PI * 2 - Math.PI / 2;
    const x = cxVal + outerR * Math.cos(angle);
    const y = cyVal + outerR * Math.sin(angle);
    const state = phaseMap.get(name) || { name, status: 'idle' };
    const isRunning = state.status === 'running';

    return h('g', {
      key: name,
      style: { cursor: 'pointer' },
      onMouseEnter: (e: any) => { setHoveredPhase(state); setTooltipPos({ x: e.clientX || 0, y: e.clientY || 0 }); },
      onMouseLeave: () => setHoveredPhase(null),
    },
      // Running pulse
      isRunning
        ? h('circle', { cx: x, cy: y, r: nodeR + 4, fill: phaseColor(state.status), opacity: '0.2' },
            h('animate', { attributeName: 'r', values: `${nodeR + 2};${nodeR + 6};${nodeR + 2}`, dur: '1.5s', repeatCount: 'indefinite' }),
            h('animate', { attributeName: 'opacity', values: '0.3;0.1;0.3', dur: '1.5s', repeatCount: 'indefinite' }),
          )
        : null,
      // Node circle
      h('circle', {
        cx: x, cy: y, r: nodeR,
        fill: phaseColor(state.status),
        stroke: phaseStroke(state.status),
        strokeWidth: '1.5',
        strokeDasharray: phaseDash(state.status),
      }),
      // Abbreviated label
      h('text', {
        x, y,
        textAnchor: 'middle',
        dominantBaseline: 'central',
        fontSize: '6',
        fill: 'currentColor',
        opacity: '0.7',
        style: { pointerEvents: 'none', userSelect: 'none' },
      }, name.slice(0, 3).toUpperCase()),
    );
  });

  // Build inner ring nodes (dream phases)
  const innerNodes = DREAM_PHASES.map((name, i) => {
    const angle = (i / DREAM_PHASES.length) * Math.PI * 2 - Math.PI / 2;
    const x = cxVal + innerR * Math.cos(angle);
    const y = cyVal + innerR * Math.sin(angle);
    const state = phaseMap.get(name) || { name, status: 'idle' };
    const isRunning = state.status === 'running';

    return h('g', {
      key: name,
      style: { cursor: 'pointer' },
      onMouseEnter: (e: any) => { setHoveredPhase(state); setTooltipPos({ x: e.clientX || 0, y: e.clientY || 0 }); },
      onMouseLeave: () => setHoveredPhase(null),
    },
      // Running pulse
      isRunning
        ? h('circle', { cx: x, cy: y, r: innerNodeR + 3, fill: '#a78bfa', opacity: '0.2' },
            h('animate', { attributeName: 'r', values: `${innerNodeR + 1};${innerNodeR + 5};${innerNodeR + 1}`, dur: '2s', repeatCount: 'indefinite' }),
          )
        : null,
      // Node circle
      h('circle', {
        cx: x, cy: y, r: innerNodeR,
        fill: state.status === 'idle' ? '#525252' : '#a78bfa',
        stroke: phaseStroke(state.status),
        strokeWidth: '1',
        strokeDasharray: phaseDash(state.status),
        opacity: state.status === 'idle' ? '0.5' : '1',
      }),
      // Label
      h('text', {
        x, y,
        textAnchor: 'middle',
        dominantBaseline: 'central',
        fontSize: '5',
        fill: 'currentColor',
        opacity: '0.5',
        style: { pointerEvents: 'none', userSelect: 'none' },
      }, `D${i + 1}`),
    );
  });

  // Center text color
  const centerColor = MODE_SVG_COLOR[tickMode] || '#737373';

  return h('div', { className: 'relative flex justify-center' },
    h('svg', { viewBox: '0 0 400 400', style: { height: '360px', width: '360px' } },
      // Outer ring track
      h('circle', { cx: cxVal, cy: cyVal, r: outerR, fill: 'none', stroke: 'currentColor', strokeWidth: '1', opacity: '0.15' }),
      // Inner ring track
      h('circle', { cx: cxVal, cy: cyVal, r: innerR, fill: 'none', stroke: 'currentColor', strokeWidth: '1', opacity: '0.1' }),
      // Outer (active) phase nodes
      ...outerNodes,
      // Inner (dream) phase nodes
      ...innerNodes,
      // Center: tick mode
      h('text', {
        x: cxVal, y: cyVal - 10,
        textAnchor: 'middle',
        fontSize: '14',
        fontWeight: '600',
        fill: centerColor,
      }, (tickMode || 'unknown').replace(/_/g, ' ').toUpperCase()),
      // Center: tick count
      h('text', {
        x: cxVal, y: cyVal + 12,
        textAnchor: 'middle',
        fontSize: '10',
        fill: 'currentColor',
        opacity: '0.5',
      }, `tick #${(tickCount || 0).toLocaleString()}`),
    ),

    // Tooltip
    hoveredPhase
      ? h('div', {
          className: 'pointer-events-none fixed z-50 rounded-xl border border-border/50 bg-popover/95 px-3 py-2 shadow-xl',
          style: { left: tooltipPos.x + 12, top: tooltipPos.y - 40 },
        },
          h('p', { className: 'text-xs font-semibold' }, formatPhaseName(hoveredPhase.name)),
          h('p', { className: 'text-[10px] text-muted-foreground capitalize' }, hoveredPhase.status),
          hoveredPhase.duration_ms != null
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, `${hoveredPhase.duration_ms}ms`)
            : null,
          hoveredPhase.budget_ms != null
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, `Budget: ${hoveredPhase.budget_ms}ms`)
            : null,
          hoveredPhase.last_run
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, hoveredPhase.last_run)
            : null,
        )
      : null,
  );
}

/* ------------------------------------------------------------------ */
/*  GaiaTab component                                                 */
/* ------------------------------------------------------------------ */

export function GaiaTab({ onAction }: { onAction: any }) {
  const [status, setStatus] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [hoveredPhase, setHoveredPhase] = useState<any>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const feedRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  /* -- Fetch status ------------------------------------------------ */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await Promise.resolve(onAction?.('gaia-status'));
      if (res?.ok === false) {
        setError(res.error || 'Failed to fetch GAIA status');
      } else {
        setStatus(res?.data ?? res);
        setLastFetched(new Date());
        setError('');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setLoading(false);
  }, [onAction]);

  /* -- Fetch events ------------------------------------------------ */
  const fetchEvents = useCallback(async () => {
    try {
      const res = await Promise.resolve(onAction?.('gaia-events', { query: { limit: '50' } }));
      if (res?.ok !== false && (res?.data || res)) {
        const newEvents = asArray(res?.data ?? res);
        setEvents((prev: any[]) => {
          const seen = new Set(prev.map((e: any) => `${e.timestamp}|${e.phase}`));
          const merged = [...prev, ...newEvents.filter((e: any) => !seen.has(`${e.timestamp}|${e.phase}`))];
          return merged.slice(-200);
        });
      }
    } catch { /* ignore event fetch errors */ }
  }, [onAction]);

  /* -- Effects ----------------------------------------------------- */
  useEffect(() => { fetchStatus(); fetchEvents(); }, [fetchStatus, fetchEvents]);

  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(() => { fetchStatus(); fetchEvents(); }, POLL_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [live, fetchStatus, fetchEvents]);

  useEffect(() => {
    if (live && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events, live]);

  /* -- Derived ----------------------------------------------------- */
  const mode = status?.tick_mode || status?.tickMode || status?.state || 'unknown';
  const mc = MODE_CONFIG[mode] || { color: 'text-gray-400', bg: 'bg-gray-500/10', label: mode.replace(/_/g, ' ') };
  const tickCount = status?.tick_count ?? status?.tickCount ?? 0;
  const phases: any[] = asArray(status?.phases);
  const buf = status?.sensory_buffer;
  const channels: any[] = asArray(status?.channels);
  const sessions = status?.sessions;
  const gate = status?.notification_gate;
  const dream = status?.dream_cycle;

  /* -- Render ------------------------------------------------------ */

  const headerActions = h('div', { className: 'flex items-center gap-2' },
    lastFetched
      ? h('span', { className: 'text-[10px] text-muted-foreground' }, `Updated ${formatSecondsAgo(lastFetched)}`)
      : null,
    h('button', {
      type: 'button',
      onClick: () => setLive(!live),
      className: cx(
        'flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-medium transition-colors',
        live
          ? 'bg-red-500/10 text-red-400'
          : 'border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground',
      ),
    },
      live ? h('span', { className: 'h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400' }) : null,
      live ? 'Stop' : 'Live',
    ),
    h(ActionButton, {
      label: loading ? 'Refreshing...' : 'Refresh',
      onClick: () => { fetchStatus(); fetchEvents(); },
      disabled: loading,
      variant: 'secondary',
    }),
  );

  if (loading) {
    return h(Section, { title: 'GAIA Cognitive Engine', subtitle: 'Loading...', actions: headerActions },
      h('p', { className: 'py-8 text-center text-sm text-muted-foreground' }, 'Loading GAIA status...'),
    );
  }

  if (error && !status) {
    return h(Section, { title: 'GAIA Cognitive Engine', actions: headerActions },
      h('div', { className: 'flex flex-col items-center gap-3 py-8' },
        h('span', { className: 'text-2xl' }, '\u26A0'),
        h('p', { className: 'text-sm text-muted-foreground' }, error),
        h(ActionButton, { label: 'Retry', onClick: fetchStatus }),
      ),
    );
  }

  return h(Section, {
    title: 'GAIA Cognitive Engine',
    subtitle: 'Autonomous loop status and tick events',
    actions: headerActions,
  },
    h('div', { className: 'grid gap-6' },

      /* -- Tick mode badge ------------------------------------------ */
      h('div', { className: 'flex items-center gap-3' },
        h('span', {
          className: cx('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', mc.bg, mc.color),
        }, mc.label),
        h('span', { className: 'text-xs text-muted-foreground' }, `Tick #${tickCount.toLocaleString()}`),
        status?.uptime_seconds != null
          ? h('span', { className: 'text-xs text-muted-foreground' }, `Uptime: ${Math.floor(status.uptime_seconds / 60)}m`)
          : null,
      ),

      /* -- Phase Wheel --------------------------------------------- */
      renderPhaseWheel(phases, mode, tickCount, hoveredPhase, setHoveredPhase, tooltipPos, setTooltipPos),

      /* -- Status cards grid --------------------------------------- */
      h('div', { className: 'grid grid-cols-2 gap-3 lg:grid-cols-3' },

        // Tick Mode card
        h('div', { className: 'rounded-2xl border border-border/50 bg-card/30 p-3' },
          h('p', { className: 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground' }, 'Tick Mode'),
          h('p', { className: cx('mt-1 text-sm font-semibold capitalize', mc.color) }, mode.replace(/_/g, ' ')),
          status?.uptime_seconds != null
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, `Uptime: ${Math.floor(status.uptime_seconds / 60)}m`)
            : null,
        ),

        // Sensory Buffer card
        h('div', { className: 'rounded-2xl border border-border/50 bg-card/30 p-3' },
          h('p', { className: 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground' }, 'Sensory Buffer'),
          h('p', { className: 'mt-1 text-lg font-bold' },
            String(buf?.depth ?? '\u2014'),
            h('span', { className: 'text-xs font-normal text-muted-foreground' }, `/${buf?.max_capacity ?? 1000}`),
          ),
          buf?.recent_signals != null
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, `${buf.recent_signals} recent signals`)
            : null,
        ),

        // Channels card
        h('div', { className: 'rounded-2xl border border-border/50 bg-card/30 p-3' },
          h('p', { className: 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground' }, 'Channels'),
          h('div', { className: 'mt-1 flex flex-col gap-1' },
            channels.length > 0
              ? channels.map((ch: any) =>
                  h('div', { key: ch.name, className: 'flex items-center gap-1.5' },
                    h('span', { className: cx('h-1.5 w-1.5 rounded-full', ch.connected ? 'bg-emerald-400' : 'bg-gray-500') }),
                    h('span', { className: 'text-xs' }, ch.name),
                    ch.type
                      ? h('span', { className: 'rounded-full bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground' }, ch.type)
                      : null,
                  ),
                )
              : h('span', { className: 'text-xs text-muted-foreground' }, 'No active channels'),
          ),
        ),

        // Sessions card
        h('div', { className: 'rounded-2xl border border-border/50 bg-card/30 p-3' },
          h('p', { className: 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground' }, 'Sessions'),
          h('p', { className: 'mt-1 text-lg font-bold' }, String(sessions?.active_count ?? '\u2014')),
          sessions?.ttl != null
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, `TTL: ${sessions.ttl}s`)
            : null,
          sessions?.identities?.length
            ? h('div', { className: 'mt-1 flex flex-wrap gap-1' },
                ...sessions.identities.slice(0, 3).map((id: string) =>
                  h('span', { key: id, className: 'rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary' }, id),
                ),
                sessions.identities.length > 3
                  ? h('span', { className: 'text-[9px] text-muted-foreground' }, `+${sessions.identities.length - 3}`)
                  : null,
              )
            : null,
        ),

        // Notification Gate card
        h('div', { className: 'rounded-2xl border border-border/50 bg-card/30 p-3' },
          h('p', { className: 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground' }, 'Notification Gate'),
          h('div', { className: 'mt-1.5 flex flex-col gap-1' },
            h('div', { className: 'flex items-center gap-1.5' },
              h('span', { className: cx('h-1.5 w-1.5 rounded-full', gate?.schedule ? 'bg-emerald-400' : 'bg-gray-500') }),
              h('span', { className: 'text-[10px]' }, `Schedule: ${gate?.schedule ? 'Open' : 'Closed'}`),
            ),
            h('div', { className: 'flex items-center gap-1.5' },
              h('span', { className: 'h-1.5 w-1.5 rounded-full bg-blue-400' }),
              h('span', { className: 'text-[10px]' }, `Presence: ${gate?.presence || '\u2014'}`),
            ),
            h('div', { className: 'flex items-center gap-1.5' },
              h('span', { className: 'h-1.5 w-1.5 rounded-full bg-violet-400' }),
              h('span', { className: 'text-[10px]' }, `Behavioral: ${gate?.behavioral != null ? `${(gate.behavioral * 100).toFixed(0)}%` : '\u2014'}`),
            ),
          ),
        ),

        // Dream Cycle card
        h('div', { className: 'rounded-2xl border border-border/50 bg-card/30 p-3' },
          h('p', { className: 'text-[10px] font-medium uppercase tracking-wider text-muted-foreground' }, 'Dream Cycle'),
          h('div', { className: 'mt-1 flex items-center gap-1.5' },
            h('span', { className: cx('text-sm', dream?.active ? 'text-violet-400' : 'text-gray-500') }, '\u263E'),
            h('span', { className: 'text-xs font-medium' }, dream?.active ? 'Active' : 'Idle'),
          ),
          dream?.last_run
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, `Last: ${dream.last_run}`)
            : null,
          dream?.insight_count != null
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, `${dream.insight_count} insights`)
            : null,
          dream?.phase_progress
            ? h('p', { className: 'text-[10px] text-muted-foreground' }, dream.phase_progress)
            : null,
        ),
      ),

      /* -- Tick event stream --------------------------------------- */
      h('div', null,
        h('div', { className: 'mb-2 flex items-center justify-between' },
          h('div', { className: 'flex items-center gap-2' },
            h('span', { className: 'text-sm' }, '\u2263'),
            h('span', { className: 'text-xs font-medium' }, 'Tick Stream'),
            live
              ? h('span', { className: 'flex items-center gap-1 text-[10px] text-emerald-400' },
                  h('span', { className: 'h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400' }),
                  'Live',
                )
              : null,
          ),
          h('span', { className: 'text-[10px] text-muted-foreground' }, `${events.length} events`),
        ),

        h('div', {
          ref: feedRef,
          className: 'max-h-[300px] overflow-y-auto rounded-2xl border border-border/30 bg-card/10',
        },
          events.length === 0
            ? h('p', { className: 'py-6 text-center text-xs text-muted-foreground' }, 'No tick events yet')
            : h('table', { className: 'w-full text-[11px]' },
                h('thead', { className: 'sticky top-0 bg-card/80' },
                  h('tr', { className: 'border-b border-border/30 text-left text-muted-foreground' },
                    h('th', { className: 'px-3 py-1.5 font-medium' }, 'Time'),
                    h('th', { className: 'px-3 py-1.5 font-medium' }, 'Phase'),
                    h('th', { className: 'px-3 py-1.5 font-medium text-right' }, 'Duration'),
                    h('th', { className: 'px-3 py-1.5 font-medium' }, 'Status'),
                  ),
                ),
                h('tbody', null,
                  ...events.map((ev: any, i: number) =>
                    h('tr', {
                      key: `${ev.timestamp}-${ev.phase}-${i}`,
                      className: 'border-b border-border/10 hover:bg-muted/20',
                    },
                      h('td', { className: 'px-3 py-1 font-mono text-muted-foreground' }, ev.timestamp || '\u2014'),
                      h('td', { className: 'px-3 py-1' }, (ev.phase || '').replace(/_/g, ' ')),
                      h('td', { className: 'px-3 py-1 text-right font-mono' },
                        ev.duration_ms != null ? `${ev.duration_ms}ms` : '\u2014',
                      ),
                      h('td', { className: 'px-3 py-1' },
                        h('span', {
                          className: cx(
                            'rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                            ev.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                            ev.status === 'running' ? 'bg-blue-500/10 text-blue-400' :
                            ev.status === 'skipped' ? 'bg-gray-500/10 text-gray-400' :
                            'bg-muted/50 text-muted-foreground',
                          ),
                        }, ev.status || '\u2014'),
                      ),
                    ),
                  ),
                ),
              ),
        ),
      ),
    ),
  );
}
