export function createIntegrationViews(context) {
  const {
    h,
    useEffect,
    useState,
    getBridge,
    asArray,
    fmtAgo,
    fmtTime,
    Badge,
    Section,
    ActionButton,
    Field,
    TextAreaField,
    JsonBox,
    EmptyState,
    SegmentTabs,
    parseJson,
  } = context;

  function GitHubView({ onAction }) {
    const [tab, setTab] = useState('pulls');
    const [repoFilter, setRepoFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(null);
    const [repos, setRepos] = useState([]);
    const [items, setItems] = useState([]);
    const [error, setError] = useState('');

    const loadStatus = async () => {
      try {
        const [statusResult, repoResult] = await Promise.all([
          Promise.resolve(onAction?.('daemon-call', { path: '/api/github/status', quiet: true })),
          Promise.resolve(onAction?.('daemon-call', { path: '/api/github/repos', quiet: true })),
        ]);
        setStatus(statusResult?.data || null);
        setRepos(asArray(repoResult?.data).map((entry) => typeof entry === 'string' ? entry : entry?.full_name || entry?.name).filter(Boolean));
      } catch (errorValue) {
        setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
        setStatus(null);
        setRepos([]);
      }
    };

    const loadItems = async () => {
      setLoading(true);
      setError('');
      try {
        const path = tab === 'pulls' ? '/api/github/pulls' : tab === 'issues' ? '/api/github/issues' : '/api/github/commits';
        const result = await Promise.resolve(onAction?.('daemon-call', {
          path,
          query: repoFilter ? { repo: repoFilter } : undefined,
          quiet: true,
        }));
        if (result?.ok === false) {
          setError(result.error || 'Request failed.');
          setItems([]);
        } else {
          setItems(asArray(result?.data));
        }
      } catch (errorValue) {
        setError(errorValue instanceof Error ? errorValue.message : String(errorValue));
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      void loadStatus();
    }, []);

    useEffect(() => {
      void loadItems();
    }, [tab, repoFilter]);

    const openExternal = (url) => {
      if (!url) return;
      void onAction?.('open-external', { url });
    };

    return h(
      'div',
      { className: 'space-y-5' },
      h(Section, {
        title: 'GitHub',
        subtitle: 'Daemon-backed GitHub status, pull requests, issues, and commits.',
        actions: [
          h(ActionButton, { key: 'refresh', label: loading ? 'Refreshing...' : 'Refresh', onClick: () => { void loadStatus(); void loadItems(); }, disabled: loading, variant: 'secondary' }),
        ],
      },
      h('div', { className: 'grid gap-4 md:grid-cols-[0.9fr_1.1fr]' },
        h(JsonBox, { value: status, emptyLabel: 'No GitHub status loaded yet.' }),
        h('div', { className: 'space-y-3' },
          h(SegmentTabs, {
            tabs: [
              { key: 'pulls', label: 'Pull Requests' },
              { key: 'issues', label: 'Issues' },
              { key: 'commits', label: 'Commits' },
            ],
            active: tab,
            onChange: setTab,
          }),
          h(Field, { label: 'Repo Filter', value: repoFilter, onChange: setRepoFilter, placeholder: repos.length > 0 ? repos[0] : 'owner/repo' }),
          repos.length > 0 ? h('div', { className: 'flex flex-wrap gap-2' },
            repos.slice(0, 12).map((repo) => h(ActionButton, {
              key: repo,
              label: repo,
              onClick: () => setRepoFilter(repoFilter === repo ? '' : repo),
              variant: repoFilter === repo ? 'default' : 'secondary',
            })),
          ) : null,
        ),
      )),
      error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) : null,
      loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading GitHub data...') : null,
      !loading && items.length === 0 ? h(EmptyState, { title: 'No GitHub records', body: 'Refresh the panel or adjust the repo filter to load daemon-backed GitHub data.' }) : null,
      !loading && items.length > 0 ? h(
        'div',
        { className: 'space-y-2' },
        items.map((item, index) => {
          const repo = item?.repo || item?.repository || item?.full_name || item?.name || '';
          const title = item?.title || item?.message || item?.sha || item?.head_sha || `${tab} record ${index + 1}`;
          const stateValue = item?.state || item?.status || '';
          const url = item?.html_url || item?.url || item?.web_url || '';
          const metaLine = [
            repo,
            item?.author?.login || item?.user?.login || item?.author || '',
            item?.updated_at ? fmtAgo(item.updated_at) : item?.created_at ? fmtAgo(item.created_at) : '',
          ].filter(Boolean).join(' • ');
          return h(
            'div',
            { key: `${title}-${index}`, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
            h('div', { className: 'flex flex-wrap items-center justify-between gap-3' },
              h('div', { className: 'min-w-0 flex-1' },
                h('div', { className: 'text-sm font-medium break-all' }, title),
                metaLine ? h('div', { className: 'mt-1 text-xs text-muted-foreground' }, metaLine) : null,
              ),
              h('div', { className: 'flex items-center gap-2' },
                stateValue ? h(Badge, { status: String(stateValue).toLowerCase() }) : null,
                url ? h(ActionButton, { label: 'Open', onClick: () => openExternal(url), variant: 'secondary' }) : null,
              ),
            ),
            item?.body ? h('p', { className: 'mt-2 whitespace-pre-wrap text-sm text-muted-foreground' }, item.body) : null,
          );
        }),
      ) : null,
    );
  }

  function KnowledgeView({ onAction }) {
    const bridge = getBridge();
    const [tab, setTab] = useState('query');
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState('10');
    const [queryResult, setQueryResult] = useState(null);
    const [browseTag, setBrowseTag] = useState('');
    const [browseSource, setBrowseSource] = useState('');
    const [browseResult, setBrowseResult] = useState(null);
    const [ingestContent, setIngestContent] = useState('');
    const [metadataText, setMetadataText] = useState('{}');
    const [ingestResult, setIngestResult] = useState(null);
    const [monitors, setMonitors] = useState([]);
    const [healthResult, setHealthResult] = useState(null);
    const [statusResult, setStatusResult] = useState(null);
    const [absorbInput, setAbsorbInput] = useState('');
    const [jobId, setJobId] = useState('');
    const [absorbResult, setAbsorbResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const run = async (action, data, setter) => {
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
      } catch (errorValue) {
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
      } catch (errorValue) {
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
      } catch (errorValue) {
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
      const paths = files.map((file) => file?.path).filter(Boolean);
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

    let body = null;

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
          monitors.map((monitor) => h(
            'div',
            { key: monitor.id || monitor.path, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
            h('div', { className: 'flex flex-wrap items-center justify-between gap-3' },
              h('div', { className: 'min-w-0 flex-1' },
                h('div', { className: 'text-sm font-medium break-all' }, monitor.path || monitor.id),
                h('div', { className: 'mt-1 text-xs text-muted-foreground' }, `${monitor.status || 'unknown'}${monitor.file_count != null ? ` • ${monitor.file_count} files` : ''}${monitor.last_scan ? ` • last scan ${fmtTime(monitor.last_scan)}` : ''}`),
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

  function MarketplaceView({ onAction }) {
    const [tab, setTab] = useState('browse');
    const [available, setAvailable] = useState([]);
    const [installed, setInstalled] = useState([]);
    const [selectedConfig, setSelectedConfig] = useState(null);
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
      } catch (errorValue) {
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
      } catch (errorValue) {
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

    const mutate = async (path, id) => {
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

    const loadConfig = async (id) => {
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
        list.map((entry, index) => {
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

  return {
    GitHubView,
    KnowledgeView,
    MarketplaceView,
  };
}
