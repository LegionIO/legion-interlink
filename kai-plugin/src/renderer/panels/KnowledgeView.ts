/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { fmtTime, asArray, parseJson } from '../lib/utils.js';
import { getBridge } from '../lib/bridge.js';
import { Section, ActionButton, Field, TextAreaField, SegmentTabs, JsonBox, EmptyState } from '../components/index.js';

export function KnowledgeView({ onAction }: any): any {
  const bridge = getBridge();
  const [tab, setTab] = useState('query');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState('10');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [browseTag, setBrowseTag] = useState('');
  const [browseSource, setBrowseSource] = useState('');
  const [browseResult, setBrowseResult] = useState<any>(null);
  const [ingestContent, setIngestContent] = useState('');
  const [metadataText, setMetadataText] = useState('{}');
  const [ingestResult, setIngestResult] = useState<any>(null);
  const [monitors, setMonitors] = useState<any[]>([]);
  const [healthResult, setHealthResult] = useState<any>(null);
  const [statusResult, setStatusResult] = useState<any>(null);
  const [absorbInput, setAbsorbInput] = useState('');
  const [jobId, setJobId] = useState('');
  const [absorbResult, setAbsorbResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: string, data: any, setter: any) => {
    setBusy(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.(action, data));
      if (result?.ok === false) {
        setError(result.error || 'Request failed.');
        if (setter) setter(null);
      } else if (setter) {
        setter(result?.data ?? result);
      }
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      if (setter) setter(null);
    } finally {
      setBusy(false);
    }
  };

  const refreshMonitors = async () => {
    try {
      const result = await Promise.resolve(onAction?.('knowledge-monitors-list'));
      if (result?.ok === false) {
        setError(result.error || 'Failed to load monitors.');
        return;
      }
      setMonitors(asArray(result?.data, 'monitors'));
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
    }
  };

  const refreshHealth = async () => {
    try {
      const [statusRes, healthRes] = await Promise.all([
        Promise.resolve(onAction?.('knowledge-status')),
        Promise.resolve(onAction?.('knowledge-health')),
      ]);
      setStatusResult(statusRes?.data || null);
      setHealthResult(healthRes?.data || null);
    } catch (errorValue: any) {
      setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
      setStatusResult(null);
      setHealthResult(null);
    }
  };

  useEffect(() => {
    if (tab === 'monitors' && monitors.length === 0) {
      void refreshMonitors();
    }
    if (tab === 'health' && !statusResult && !healthResult) {
      void refreshHealth();
    }
  }, [tab]);

  const pickFiles = async () => {
    const raw = await bridge?.dialog?.openFile?.({
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'html', 'htm', 'md', 'csv', 'json', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    const files = raw?.files || [];
    if (!Array.isArray(files) || files.length === 0) return;
    const paths = files.map((file: any) => file?.path).filter(Boolean);
    if (paths.length === 0) return;
    await run('knowledge-ingest-file', { filePath: paths[0] }, setIngestResult);
  };

  const pickDirectory = async () => {
    const result = await bridge?.dialog?.openDirectoryFiles?.();
    if (!result || result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) return;
    await run('knowledge-ingest-file', { filePath: result.filePaths[0] }, setIngestResult);
  };

  const tabs = [
    { key: 'query', label: 'Query' },
    { key: 'browse', label: 'Browse' },
    { key: 'ingest', label: 'Ingest' },
    { key: 'monitors', label: 'Monitors' },
    { key: 'health', label: 'Health' },
    { key: 'absorb', label: 'Absorb' },
  ];

  let body: any = null;

  if (tab === 'query') {
    body = h(Section, {
      title: 'Apollo Query',
      subtitle: 'Run retrieval queries against daemon knowledge stores.',
    },
    h('div', { className: 'grid gap-4 lg:grid-cols-[1fr_160px]' },
      h(TextAreaField, { label: 'Query', value: query, onChange: setQuery, placeholder: 'What knowledge should Legion retrieve?', rows: 4 }),
      h(Field, { label: 'Limit', value: limit, onChange: setLimit, placeholder: '10' }),
    ),
    h('div', { className: 'mt-4 flex flex-wrap gap-2' },
      h(ActionButton, { label: busy ? 'Querying...' : 'Query', onClick: () => run('knowledge-query', { query, limit: Number(limit) || 10 }, setQueryResult), disabled: busy || !query.trim() }),
    ),
    h('div', { className: 'mt-4' }, h(JsonBox, { value: queryResult, emptyLabel: 'Run a knowledge query to inspect results here.' })));
  }

  if (tab === 'browse') {
    body = h(Section, {
      title: 'Browse Knowledge',
      subtitle: 'Search daemon entries by tag or source channel.',
    },
    h('div', { className: 'grid gap-4 md:grid-cols-2' },
      h(Field, { label: 'Tag', value: browseTag, onChange: setBrowseTag, placeholder: 'project, code, docs' }),
      h(Field, { label: 'Source', value: browseSource, onChange: setBrowseSource, placeholder: 'github, slack, local file' }),
    ),
    h('div', { className: 'mt-4 flex flex-wrap gap-2' },
      h(ActionButton, { label: busy ? 'Loading...' : 'Browse', onClick: () => run('knowledge-browse', { filters: { tag: browseTag, source: browseSource, per_page: '50' } }, setBrowseResult), disabled: busy }),
    ),
    h('div', { className: 'mt-4' }, h(JsonBox, { value: browseResult, emptyLabel: 'Browse results will appear here.' })));
  }

  if (tab === 'ingest') {
    body = h(Section, {
      title: 'Ingest Content',
      subtitle: 'Send text or selected files into daemon knowledge ingestion.',
    },
    h(TextAreaField, { label: 'Content', value: ingestContent, onChange: setIngestContent, placeholder: 'Paste text, markdown, notes, or extracted content to ingest.', rows: 8 }),
    h(TextAreaField, { label: 'Metadata JSON', value: metadataText, onChange: setMetadataText, placeholder: '{"tags":["notes"]}', rows: 5 }),
    h('div', { className: 'mt-4 flex flex-wrap gap-2' },
      h(ActionButton, {
        label: busy ? 'Ingesting...' : 'Ingest Text',
        onClick: () => {
          const metadata = parseJson(metadataText, {});
          if (metadata == null) {
            setError('Metadata JSON must be valid.');
            return;
          }
          void run('knowledge-ingest-content', { content: ingestContent, metadata }, setIngestResult);
        },
        disabled: busy || !ingestContent.trim(),
      }),
      h(ActionButton, { label: 'Pick File', onClick: () => { void pickFiles(); }, disabled: busy, variant: 'secondary' }),
      h(ActionButton, { label: 'Pick Directory', onClick: () => { void pickDirectory(); }, disabled: busy, variant: 'secondary' }),
    ),
    h('div', { className: 'mt-4' }, h(JsonBox, { value: ingestResult, emptyLabel: 'No ingest results yet.' })));
  }

  if (tab === 'monitors') {
    body = h(Section, {
      title: 'Corpus Monitors',
      subtitle: 'Manage daemon-side filesystem monitors for knowledge capture.',
      actions: [
        h(ActionButton, { key: 'refresh', label: 'Refresh', onClick: () => { void refreshMonitors(); }, variant: 'secondary' }),
      ],
    },
    h('div', { className: 'mb-4 flex flex-wrap gap-2' },
      h(ActionButton, { label: 'Choose Path And Add', onClick: async () => {
        const raw = await bridge?.dialog?.openFile?.();
        const filePath = raw?.files?.[0]?.path;
        if (filePath) {
          const slashIndex = filePath.lastIndexOf('/');
          const dirPath = slashIndex >= 0 ? filePath.slice(0, slashIndex) : filePath;
          await run('knowledge-monitor-add', { path: dirPath }, null);
          await refreshMonitors();
        }
      }, variant: 'secondary' }),
    ),
    monitors.length === 0
      ? h('p', { className: 'text-sm text-muted-foreground' }, 'No monitors are currently configured.')
      : h(
        'div',
        { className: 'space-y-2' },
        monitors.map((monitor: any) => h(
          'div',
          { key: monitor.id || monitor.path, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', { className: 'flex flex-wrap items-center justify-between gap-3' },
            h('div', { className: 'min-w-0 flex-1' },
              h('div', { className: 'text-sm font-medium break-all' }, monitor.path || monitor.id),
              h('div', { className: 'mt-1 text-xs text-muted-foreground' }, `${monitor.status || 'unknown'}${monitor.file_count != null ? ` \u2022 ${monitor.file_count} files` : ''}${monitor.last_scan ? ` \u2022 last scan ${fmtTime(monitor.last_scan)}` : ''}`),
            ),
            h('div', { className: 'flex flex-wrap gap-2' },
              h(ActionButton, { label: 'Scan', onClick: () => { void run('knowledge-monitor-scan', { id: monitor.id }, null).then(() => refreshMonitors()); }, variant: 'secondary' }),
              h(ActionButton, { label: 'Remove', onClick: () => { void run('knowledge-monitor-remove', { id: monitor.id }, null).then(() => refreshMonitors()); }, variant: 'danger' }),
            ),
          ),
        )),
      ));
  }

  if (tab === 'health') {
    body = h(Section, {
      title: 'Knowledge Health',
      subtitle: 'Inspect daemon Apollo health and run maintenance.',
      actions: [
        h(ActionButton, { key: 'refresh', label: 'Refresh', onClick: () => { void refreshHealth(); }, variant: 'secondary' }),
        h(ActionButton, { key: 'maintain', label: 'Run Maintenance', onClick: () => { void run('knowledge-maintain', {}, setHealthResult).then(() => refreshHealth()); }, variant: 'secondary' }),
      ],
    },
    h('div', { className: 'grid gap-4 xl:grid-cols-2' },
      h(JsonBox, { value: statusResult, emptyLabel: 'No knowledge status loaded yet.' }),
      h(JsonBox, { value: healthResult, emptyLabel: 'No Apollo stats loaded yet.' }),
    ));
  }

  if (tab === 'absorb') {
    body = h(Section, {
      title: 'Absorber Pipeline',
      subtitle: 'Resolve and dispatch absorber jobs through the daemon.',
    },
    h(TextAreaField, { label: 'Input', value: absorbInput, onChange: setAbsorbInput, placeholder: 'Describe what should be resolved or dispatched.', rows: 4 }),
    h(Field, { label: 'Job ID', value: jobId, onChange: setJobId, placeholder: 'Optional existing job id' }),
    h('div', { className: 'mt-4 flex flex-wrap gap-2' },
      h(ActionButton, { label: 'Resolve', onClick: () => run('absorber-resolve', { input: absorbInput }, setAbsorbResult), disabled: busy || !absorbInput.trim() }),
      h(ActionButton, { label: 'Dispatch', onClick: () => run('absorber-dispatch', { input: absorbInput }, setAbsorbResult), disabled: busy || !absorbInput.trim(), variant: 'secondary' }),
      h(ActionButton, { label: 'Lookup Job', onClick: () => run('absorber-job', { jobId }, setAbsorbResult), disabled: busy || !jobId.trim(), variant: 'secondary' }),
    ),
    h('div', { className: 'mt-4' }, h(JsonBox, { value: absorbResult, emptyLabel: 'No absorber result yet.' })));
  }

  return h(
    'div',
    { className: 'space-y-5' },
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) : null,
    h(SegmentTabs, { tabs, active: tab, onChange: setTab }),
    body,
  );
}
