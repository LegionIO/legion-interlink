/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect, useCallback, useRef } from '../lib/react.js';
import { asArray, fmtAgo, fmtTime, fmtNumber, cx } from '../lib/utils.js';
import { Section, ActionButton, StatCard, EmptyState, JsonBox, SegmentTabs } from '../components/index.js';

const TYPE_COLORS: Record<string, string> = {
  working: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  observational: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  semantic: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'working', label: 'Working' },
  { key: 'observational', label: 'Observational' },
  { key: 'semantic', label: 'Semantic' },
];

function typeBadge(type: string) {
  const colors = TYPE_COLORS[type] || 'bg-slate-500/10 text-slate-700 dark:text-slate-300';
  return h('span', {
    className: cx('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize', colors),
  }, type || 'unknown');
}

export function MemoryTab({ onAction }: { onAction: any }) {
  const [entries, setEntries] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const debounceRef = useRef<any>(null);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [e, s] = await Promise.all([
        Promise.resolve(onAction?.('memory-entries')),
        Promise.resolve(onAction?.('memory-stats')),
      ]);
      if (e?.ok === false) { setError(e.error || 'Failed to load entries'); return; }
      setEntries(e?.data ?? e);
      setStats(s?.data ?? s);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [onAction]);

  useEffect(() => { void load(); }, []);

  const deleteEntry = async (id: string) => {
    await Promise.resolve(onAction?.('memory-entry-delete', { id }));
    if (expanded === id) setExpanded(null);
    if (editing === id) { setEditing(null); setEditContent(''); }
    void load();
  };

  const saveEdit = async (id: string) => {
    await Promise.resolve(onAction?.('memory-entry-update', { id, body: { content: editContent } }));
    setEditing(null);
    setEditContent('');
    void load();
  };

  const startEdit = (entry: any) => {
    setEditing(entry.id);
    setEditContent(entry.content || '');
    setExpanded(entry.id);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditContent('');
  };

  const toggleExpand = (id: string) => {
    if (editing === id) return; // Don't collapse while editing
    setExpanded((prev) => prev === id ? null : id);
  };

  const items = asArray(entries);
  const filtered = items.filter((m: any) => {
    if (filter !== 'all' && m.type !== filter) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const text = `${m.content || ''} ${m.key || ''} ${m.source || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  // Stat helpers
  const countByType = (type: string) => items.filter((m: any) => m.type === type).length;

  return h(Section, {
    title: 'Memory', subtitle: 'Memory entries and statistics',
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    h('div', { className: 'grid gap-4' },
      // Stats cards
      h('div', { className: 'grid grid-cols-2 gap-3 md:grid-cols-5' },
        h(StatCard, { label: 'Total', value: fmtNumber(stats?.total ?? stats?.count ?? items.length) }),
        h(StatCard, { label: 'Working', value: fmtNumber(countByType('working')), subvalue: 'Short-term context' }),
        h(StatCard, { label: 'Observational', value: fmtNumber(countByType('observational')), subvalue: 'Noted patterns' }),
        h(StatCard, { label: 'Semantic', value: fmtNumber(countByType('semantic')), subvalue: 'Embedded knowledge' }),
        stats?.embeddingModel
          ? h(StatCard, { label: 'Embedding', value: stats.embeddingModel })
          : null,
      ),

      // Filter tabs
      h(SegmentTabs, { tabs: FILTER_TABS, active: filter, onChange: setFilter }),

      // Search input
      h('input', {
        type: 'text',
        placeholder: 'Search entries...',
        value: search,
        onInput: (e: any) => setSearch(e.target.value),
        className: 'w-full rounded-xl border border-border/60 bg-background/45 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40',
      }),

      // Entry count
      h('div', { className: 'text-xs text-muted-foreground' },
        `${filtered.length} of ${items.length} entries`,
        debouncedSearch ? ` matching "${debouncedSearch}"` : '',
      ),

      // Entries list
      filtered.length === 0
        ? h(EmptyState, { title: 'No entries', body: filter !== 'all' || debouncedSearch ? 'No entries match the current filter.' : 'Memory store is empty.' })
        : h('div', { className: 'grid gap-2 max-h-[480px] overflow-auto' },
            filtered.map((m: any, i: number) => {
              const id = m.id || String(i);
              const isExpanded = expanded === id;
              const isEditing = editing === id;
              return h('div', {
                key: id,
                className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3',
              },
                // Header row
                h('div', {
                  className: 'flex items-center gap-3 cursor-pointer',
                  onClick: () => toggleExpand(id),
                },
                  typeBadge(m.type || ''),
                  h('div', { className: 'min-w-0 flex-1' },
                    h('div', { className: 'truncate text-sm font-medium' }, m.content || m.key || `Entry ${i + 1}`),
                    h('div', { className: 'flex flex-wrap items-center gap-2 mt-0.5' },
                      m.score != null ? h('span', { className: 'text-[11px] text-muted-foreground' }, `score: ${m.score}`) : null,
                      m.source ? h('span', { className: 'text-[11px] text-muted-foreground' }, `source: ${m.source}`) : null,
                      m.tags?.length ? h('span', { className: 'text-[11px] text-muted-foreground' }, m.tags.join(', ')) : null,
                      m.createdAt ? h('span', { className: 'text-[11px] text-muted-foreground' }, fmtAgo(m.createdAt)) : null,
                    ),
                  ),
                  h('span', { className: 'text-[10px] text-muted-foreground/60 shrink-0' }, isExpanded ? '[-]' : '[+]'),
                ),
                // Expanded detail
                isExpanded ? h('div', { className: 'mt-3 grid gap-2' },
                  // Edit mode
                  isEditing
                    ? h('div', { className: 'grid gap-2' },
                        h('textarea', {
                          value: editContent,
                          onInput: (e: any) => setEditContent(e.target.value),
                          className: 'w-full rounded-xl border border-border/60 bg-background/55 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-1 focus:ring-primary/40',
                          rows: 4,
                        }),
                        h('div', { className: 'flex gap-2' },
                          h(ActionButton, { label: 'Save', onClick: () => saveEdit(id) }),
                          h(ActionButton, { label: 'Cancel', onClick: cancelEdit, variant: 'secondary' }),
                        ),
                      )
                    : h('div', { className: 'grid gap-2' },
                        // Full content
                        m.content ? h('div', { className: 'rounded-xl border border-border/40 bg-background/30 px-3 py-2 text-sm whitespace-pre-wrap' }, m.content) : null,
                        // Timestamps
                        h('div', { className: 'flex flex-wrap gap-4 text-[11px] text-muted-foreground' },
                          m.createdAt ? h('span', null, `Created: ${fmtTime(m.createdAt)}`) : null,
                          m.updatedAt ? h('span', null, `Updated: ${fmtTime(m.updatedAt)}`) : null,
                        ),
                        // Full metadata as JSON
                        h(JsonBox, { value: m, emptyLabel: 'No metadata.' }),
                        // Action buttons
                        h('div', { className: 'flex gap-2' },
                          h(ActionButton, { label: 'Edit', onClick: () => startEdit(m), variant: 'secondary' }),
                          h(ActionButton, { label: 'Delete', onClick: () => deleteEntry(id), variant: 'danger' }),
                        ),
                      ),
                ) : null,
              );
            }),
          ),
    ),
  );
}
