/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect, useRef, useCallback } from '../lib/react.js';
import { asArray, fmtTime, cx } from '../lib/utils.js';
import { Section, ActionButton, JsonBox, EmptyState, Toggle } from '../components/index.js';

const TYPE_COLORS: Record<string, string> = {
  task: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  worker: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  gaia: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  error: 'bg-red-500/10 text-red-700 dark:text-red-300',
  system: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  schedule: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  notification: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
};

function eventKey(evt: any): string {
  return evt.id || `${evt.type || ''}-${evt.timestamp || ''}-${evt.source || ''}`;
}

export function EventsTab({ onAction }: { onAction: any }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const feedRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const MAX_EVENTS = 200;

  const mergeEvents = useCallback((incoming: any[]) => {
    setEvents((prev) => {
      const merged = [...prev];
      for (const evt of incoming) {
        const key = eventKey(evt);
        if (!seenRef.current.has(key)) {
          seenRef.current.add(key);
          merged.push(evt);
        }
      }
      // Cap at MAX_EVENTS, keep newest
      if (merged.length > MAX_EVENTS) {
        const dropped = merged.splice(0, merged.length - MAX_EVENTS);
        for (const d of dropped) seenRef.current.delete(eventKey(d));
      }
      return merged;
    });
  }, []);

  const fetchEvents = useCallback(async (quiet = false) => {
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', {
        path: '/api/events/recent',
        query: { count: '50' },
        quiet: true,
      }));
      if (result?.ok === false) {
        if (!quiet) setError(result.error || 'Failed to fetch events');
        return;
      }
      const items = asArray(result?.data ?? result);
      mergeEvents(items);
    } catch (e: any) {
      if (!quiet) setError(e?.message || String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [onAction, mergeEvents]);

  // Initial load
  useEffect(() => { void fetchEvents(); }, []);

  // Live polling
  useEffect(() => {
    if (live) {
      timerRef.current = setInterval(() => void fetchEvents(true), 3000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [live, fetchEvents]);

  // Auto-scroll when live and events change
  useEffect(() => {
    if (live && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length, live]);

  const refresh = () => {
    seenRef.current.clear();
    setEvents([]);
    setExpanded(null);
    void fetchEvents();
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => prev === key ? null : key);
  };

  const typeBadge = (type: string) => {
    const colors = TYPE_COLORS[type] || TYPE_COLORS.system;
    return h('span', {
      className: cx('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize', colors),
    }, type || 'unknown');
  };

  return h(Section, {
    title: 'Events',
    subtitle: `${events.length} events`,
    actions: [
      h(ActionButton, { key: 'r', label: loading ? 'Refreshing...' : 'Refresh', onClick: refresh, disabled: loading, variant: 'secondary' }),
    ],
  },
    loading && events.length === 0
      ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...')
      : error
        ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' },
            error,
            h('button', {
              className: 'ml-3 text-xs underline',
              onClick: refresh,
            }, 'Retry'),
          )
        : h('div', { className: 'grid gap-3' },
            // Live toggle
            h(Toggle, {
              label: 'Live mode',
              description: 'Poll for new events every 3 seconds and auto-scroll',
              checked: live,
              onChange: setLive,
            }),
            // Event feed
            events.length === 0
              ? h(EmptyState, { title: 'No events', body: 'No recent events from the daemon.' })
              : h('div', {
                  ref: feedRef,
                  className: 'max-h-[480px] overflow-auto grid gap-1.5 rounded-2xl border border-border/60 bg-background/30 p-3',
                },
                  events.map((evt: any, i: number) => {
                    const key = eventKey(evt);
                    const isExpanded = expanded === key;
                    return h('div', {
                      key: key || i,
                      className: 'rounded-xl border border-border/50 bg-background/45 px-3 py-2',
                    },
                      h('div', {
                        className: 'flex items-center gap-3 cursor-pointer',
                        onClick: () => toggleExpand(key),
                      },
                        h('span', { className: 'font-mono text-[11px] text-muted-foreground shrink-0' },
                          fmtTime(evt.timestamp || evt.at || evt.createdAt),
                        ),
                        typeBadge(evt.type || evt.event || evt.kind || ''),
                        evt.source
                          ? h('span', { className: 'text-xs text-muted-foreground truncate' }, evt.source)
                          : null,
                        h('span', { className: 'ml-auto text-[10px] text-muted-foreground/60' }, isExpanded ? '[-]' : '[+]'),
                      ),
                      isExpanded
                        ? h('div', { className: 'mt-2' },
                            h(JsonBox, { value: evt, emptyLabel: 'No payload.' }),
                          )
                        : null,
                    );
                  }),
                ),
          ),
  );
}
