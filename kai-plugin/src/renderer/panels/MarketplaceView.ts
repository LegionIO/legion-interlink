/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray } from '../lib/utils.js';
import { Badge, Section, ActionButton, SegmentTabs, JsonBox, EmptyState } from '../components/index.js';

export function MarketplaceView({ onAction }: any): any {
  const [tab, setTab] = useState('browse');
  const [available, setAvailable] = useState<any[]>([]);
  const [installed, setInstalled] = useState<any[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadAvailable = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', { path: '/api/extensions/available', quiet: true }));
      if (result?.ok === false) {
        setError(result.error || 'Failed to load marketplace listings.');
        setAvailable([]);
      } else {
        setAvailable(asArray(result?.data));
      }
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setAvailable([]);
    } finally {
      setLoading(false);
    }
  };

  const loadInstalled = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', { path: '/api/extensions', quiet: true }));
      if (result?.ok === false) {
        setError(result.error || 'Failed to load installed extensions.');
        setInstalled([]);
      } else {
        setInstalled(asArray(result?.data));
      }
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setInstalled([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'browse' && available.length === 0) {
      void loadAvailable();
    }
    if (tab === 'installed' && installed.length === 0) {
      void loadInstalled();
    }
  }, [tab]);

  const refresh = () => {
    if (tab === 'browse') {
      void loadAvailable();
    } else {
      void loadInstalled();
    }
  };

  const mutate = async (path: string, id: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', {
        path: path.replace(':id', encodeURIComponent(id)),
        method: 'POST',
        body: {},
        refreshRuntime: true,
      }));
      if (result?.ok === false) {
        setError(result.error || 'Extension operation failed.');
      }
    } finally {
      setLoading(false);
      refresh();
    }
  };

  const loadConfig = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.('daemon-call', {
        path: `/api/extensions/${encodeURIComponent(id)}/config`,
        quiet: true,
      }));
      if (result?.ok === false) {
        setError(result.error || 'Failed to load extension config.');
        setSelectedConfig(null);
      } else {
        setSelectedConfig(result?.data || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const list = tab === 'browse' ? available : installed;

  return h(
    'div',
    { className: 'space-y-5' },
    h(Section, {
      title: 'Extension Marketplace',
      subtitle: 'Browse daemon extension listings and manage installed packages.',
      actions: [
        h(ActionButton, { key: 'refresh', label: loading ? 'Refreshing...' : 'Refresh', onClick: refresh, disabled: loading, variant: 'secondary' }),
      ],
    },
    h(SegmentTabs, {
      tabs: [
        { key: 'browse', label: 'Browse' },
        { key: 'installed', label: 'Installed' },
      ],
      active: tab,
      onChange: setTab,
    })),
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) : null,
    list.length === 0 && !loading ? h(EmptyState, {
      title: tab === 'browse' ? 'No marketplace listings' : 'No installed extensions',
      body: tab === 'browse' ? 'Refresh to load available daemon extensions.' : 'No installed daemon extensions were returned.',
    }) : null,
    list.length > 0 ? h(
      'div',
      { className: 'space-y-2' },
      list.map((entry: any, index: number) => {
        const id = entry?.id || entry?.name || `extension-${index}`;
        const title = entry?.display_name || entry?.displayName || entry?.name || entry?.id || id;
        const description = entry?.description || entry?.summary || '';
        const enabled = entry?.enabled;
        return h(
          'div',
          { key: id, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', { className: 'flex flex-wrap items-start justify-between gap-3' },
            h('div', { className: 'min-w-0 flex-1' },
              h('div', { className: 'text-sm font-medium break-all' }, title),
              description ? h('p', { className: 'mt-1 text-sm text-muted-foreground' }, description) : null,
              h('div', { className: 'mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground' },
                entry?.version ? h('span', null, `v${entry.version}`) : null,
                entry?.category ? h('span', null, entry.category) : null,
                tab === 'installed' && enabled != null ? h(Badge, { status: enabled ? 'success' : 'warning' }) : null,
              ),
            ),
            h('div', { className: 'flex flex-wrap gap-2' },
              tab === 'browse'
                ? h(ActionButton, { label: 'Install', onClick: () => { void mutate('/api/extensions/:id/install', id); }, disabled: loading })
                : null,
              tab === 'installed'
                ? h(ActionButton, { label: enabled === false ? 'Enable' : 'Disable', onClick: () => { void mutate(enabled === false ? '/api/extensions/:id/enable' : '/api/extensions/:id/disable', id); }, disabled: loading, variant: 'secondary' })
                : null,
              tab === 'installed'
                ? h(ActionButton, { label: 'Config', onClick: () => { void loadConfig(id); }, disabled: loading, variant: 'secondary' })
                : null,
              tab === 'installed'
                ? h(ActionButton, { label: 'Uninstall', onClick: () => { void mutate('/api/extensions/:id/uninstall', id); }, disabled: loading, variant: 'danger' })
                : null,
            ),
          ),
        );
      }),
    ) : null,
    h(Section, {
      title: 'Selected Extension Config',
      subtitle: 'A raw config payload from `/api/extensions/:id/config` for the most recently selected installed extension.',
    },
    h(JsonBox, { value: selectedConfig, emptyLabel: 'Select an installed extension and load its config to inspect it here.' })),
  );
}
