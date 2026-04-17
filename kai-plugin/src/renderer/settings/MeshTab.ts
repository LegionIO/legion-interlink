/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray, fmtAgo } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState, KeyValueGrid } from '../components/index.js';

export function MeshTab({ onAction }: { onAction: any }) {
  const [status, setStatus] = useState<any>(null);
  const [peers, setPeers] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, p] = await Promise.all([
        Promise.resolve(onAction?.('mesh-status')),
        Promise.resolve(onAction?.('mesh-peers')),
      ]);
      if (s?.ok === false) { setError(s.error || 'Failed'); return; }
      setStatus(s?.data ?? s);
      setPeers(p?.data ?? p);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const peerList = asArray(peers);

  return h(Section, {
    title: 'Mesh', subtitle: 'Mesh network status and peers',
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    h('div', { className: 'grid gap-4' },
      status ? h(KeyValueGrid, { items: [
        ['Node ID', status.nodeId || status.id || 'n/a'],
        ['Status', status.status || status.state || 'unknown'],
        ['Peers', String(peerList.length)],
      ] }) : null,
      h('h4', { className: 'text-xs font-semibold uppercase tracking-wider text-muted-foreground' }, 'Peers'),
      peerList.length === 0 ? h(EmptyState, { title: 'No peers', body: 'No mesh peers connected.' }) :
      h('div', { className: 'grid gap-2' }, peerList.map((p: any, i: number) =>
        h('div', { key: p.id || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', null,
            h('span', { className: 'text-sm font-medium' }, p.name || p.id || p.address),
            p.lastSeen ? h('span', { className: 'ml-2 text-xs text-muted-foreground' }, `seen ${fmtAgo(p.lastSeen)}`) : null,
          ),
          h(Badge, { status: p.status || p.state || 'online' }),
        ),
      )),
    ),
  );
}
