import { randomUUID } from 'crypto';

import {
  BACKEND_KEY,
  BANNER_ID,
  DEFAULTS,
  DEFAULT_TIMEOUT_MS,
  EVENT_RECONNECT_MAX_MS,
  EVENT_RECONNECT_MIN_MS,
  MAX_NOTIFICATIONS,
  PANEL_DEFINITIONS,
  PANEL_COMPONENT,
  PROACTIVE_THREAD_ID,
  SETTINGS_COMPONENT,
  THREAD_STATUS_ID,
  TOAST_TYPES,
  SEVERITY_MAP,
  STATUS_POLL_MIN_MS,
  cleanText,
  clampNumber,
  getCurrentState,
  getPluginConfig,
  getResolvedConfigDir,
  managedConversationIds,
  normalizeNotifications,
  replaceState,
  runtimeState,
  safeStringify,
  updateState,
  workflowStore,
} from './shared.mjs';
import {
  buildDaemonHeaders,
  daemonJson,
  ensureBackendRegistration,
  fetchWithTimeout,
  joinUrl,
  resolveAuthSource,
  toNotificationLevel,
} from './daemon-backend.mjs';

export function registerUi(api) {
  api.ui.registerSettingsSection({
    id: 'legion',
    label: 'Legion',
    component: SETTINGS_COMPONENT,
    priority: -4,
  });

  for (const panel of PANEL_DEFINITIONS) {
    api.ui.registerPanel({
      id: panel.id,
      component: PANEL_COMPONENT,
      title: panel.title,
      visible: true,
      width: panel.width,
      props: {
        view: panel.view,
      },
    });
  }

  api.ui.registerCommand({
    id: 'legion-command-center',
    label: 'Legion Command Center',
    shortcut: 'mod+k',
    visible: true,
    priority: 20,
    target: { type: 'panel', panelId: 'operations' },
  });

  updateNavigationItems(api, api.state.get() || {});
}

export function hydrateManagedConversations(api) {
  managedConversationIds.clear();
  const conversations = api.conversations.list();

  for (const conversation of conversations) {
    const metadata = conversation?.metadata || {};
    if (metadata.pluginName !== 'legion') continue;

    managedConversationIds.add(conversation.id);
    registerConversationDecoration(api, conversation.id, metadata.legionKind === 'proactive' ? 'GAIA' : 'Legion');
  }
}

export function hydrateWorkflowStore(api) {
  workflowStore.clear();
  const state = api.state.get() || {};
  const workflows = Array.isArray(state.workflows) ? state.workflows : [];
  for (const workflow of workflows) {
    if (workflow && typeof workflow.id === 'string') {
      workflowStore.set(workflow.id, workflow);
    }
  }
}

export function scheduleStatusPoll(api) {
  clearStatusPoll();
  const config = getPluginConfig(api);
  if (!config.enabled) return;

  runtimeState.statusPollTimer = setInterval(() => {
    void syncRuntime(api, {
      reason: 'poll',
      notify: false,
      recordHistory: false,
    });
  }, config.healthPollMs);
}

export function clearStatusPoll() {
  if (runtimeState.statusPollTimer) {
    clearInterval(runtimeState.statusPollTimer);
    runtimeState.statusPollTimer = null;
  }
}

export async function syncRuntime(api, options = {}) {
  const config = getPluginConfig(api);
  ensureBackendRegistration(api, config);

  if (!config.enabled) {
    stopEventStream();
    const state = replaceState(api, {
      status: 'disabled',
      configured: false,
      serviceUrl: config.daemonUrl,
      resolvedConfigDir: getResolvedConfigDir(config),
      authSource: resolveAuthSource(config),
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      dashboard: null,
      eventsConnected: false,
      managedConversationIds: [...managedConversationIds],
    }, options);
    updateBanner(api, config, state);
    updateThreadDecoration(api, state, config);
    updateNavigationItems(api, state);
    return state;
  }

  if (!config.daemonUrl) {
    stopEventStream();
    const state = replaceState(api, {
      status: 'unconfigured',
      configured: false,
      serviceUrl: '',
      resolvedConfigDir: getResolvedConfigDir(config),
      authSource: resolveAuthSource(config),
      lastCheckedAt: new Date().toISOString(),
      lastError: 'Legion daemon URL is not configured.',
      dashboard: null,
      eventsConnected: false,
      managedConversationIds: [...managedConversationIds],
    }, options);
    updateBanner(api, config, state);
    updateThreadDecoration(api, state, config);
    updateNavigationItems(api, state);
    return state;
  }

  replaceState(api, {
    status: 'checking',
    configured: true,
    serviceUrl: config.daemonUrl,
    resolvedConfigDir: getResolvedConfigDir(config),
    authSource: resolveAuthSource(config),
    managedConversationIds: [...managedConversationIds],
  }, {
    reason: options.reason,
    recordHistory: false,
  });

  const dashboardResult = await refreshDashboardSnapshot(api, { persist: false });
  const workflowsResult = await refreshWorkflowTasks(api, { quiet: true });
  const isOnline = Boolean(dashboardResult.ok && dashboardResult.snapshot && (dashboardResult.snapshot.readyOk || dashboardResult.snapshot.healthOk));

  const nextState = replaceState(api, {
    status: isOnline ? 'online' : 'offline',
    configured: true,
    serviceUrl: config.daemonUrl,
    resolvedConfigDir: getResolvedConfigDir(config),
    authSource: resolveAuthSource(config),
    lastCheckedAt: new Date().toISOString(),
    lastError: dashboardResult.ok ? null : dashboardResult.error,
    dashboard: dashboardResult.snapshot || null,
    managedConversationIds: [...managedConversationIds],
    workflowRefreshAt: workflowsResult.ok ? new Date().toISOString() : getCurrentState(api).workflowRefreshAt ?? null,
  }, options);

  if (
    options.notify !== false
    && config.notificationsEnabled
    && runtimeState.lastHealthStatus !== 'unknown'
    && runtimeState.lastHealthStatus !== nextState.status
  ) {
    api.notifications.show({
      id: `daemon-health-${Date.now()}`,
      title: nextState.status === 'online' ? 'Legion daemon is online' : 'Legion daemon is offline',
      body: nextState.status === 'online'
        ? 'The Legion daemon responded successfully.'
        : (nextState.lastError || 'The Legion daemon health check failed.'),
      level: nextState.status === 'online' ? 'success' : 'warning',
      native: config.nativeNotifications,
      autoDismissMs: 5_000,
      target: { type: 'panel', panelId: 'dashboard' },
    });
  }

  runtimeState.lastHealthStatus = nextState.status;
  updateBanner(api, config, nextState);
  updateThreadDecoration(api, nextState, config);
  updateNavigationItems(api, nextState);
  ensureEventStream(api);
  return nextState;
}

function updateBanner(api, config, state) {
  if (!config.enabled) {
    api.ui.hideBanner(BANNER_ID);
    return;
  }

  if (state.status === 'unconfigured') {
    api.ui.showBanner({
      id: BANNER_ID,
      text: 'Legion is installed but not configured yet. Add the daemon URL and auth settings in Settings to enable health checks, events, and the optional backend.',
      variant: 'info',
      dismissible: true,
      visible: true,
    });
    return;
  }

  if (state.status === 'offline') {
    api.ui.showBanner({
      id: BANNER_ID,
      text: `Legion daemon is offline${state.lastError ? `: ${state.lastError}` : '.'}`,
      variant: 'warning',
      dismissible: true,
      visible: true,
    });
    return;
  }

  api.ui.hideBanner(BANNER_ID);
}

function updateThreadDecoration(api, state, config) {
  if (!config.enabled) {
    api.ui.hideThreadDecoration(THREAD_STATUS_ID);
    return;
  }

  let label = 'Legion status unknown';
  let variant = 'info';

  if (!config.backendEnabled) {
    label = 'Legion backend disabled';
    variant = 'warning';
  } else if (state.status === 'online') {
    label = 'Legion backend online';
    variant = 'success';
  } else if (state.status === 'offline') {
    label = 'Legion backend offline';
    variant = 'warning';
  } else if (state.status === 'checking') {
    label = 'Checking Legion backend';
  } else if (state.status === 'unconfigured') {
    label = 'Configure Legion to enable backend';
  }

  api.ui.showThreadDecoration({
    id: THREAD_STATUS_ID,
    label,
    variant,
    visible: true,
  });
}

function updateNavigationItems(api, state) {
  const unreadNotifications = Number(state.unreadNotificationCount || 0);
  const workflowCounts = state.workflowCounts || { active: 0, needsInput: 0 };

  for (const panel of PANEL_DEFINITIONS) {
    let badge = undefined;
    if (panel.id === 'notifications' && unreadNotifications > 0) {
      badge = unreadNotifications;
    }
    if (panel.id === 'workflows') {
      const activeCount = Number(workflowCounts.active || 0) + Number(workflowCounts.needsInput || 0);
      if (activeCount > 0) badge = activeCount;
    }

    api.ui.registerNavigationItem({
      id: panel.navId,
      label: panel.title,
      icon: panel.icon,
      visible: true,
      priority: panel.priority,
      badge,
      target: { type: 'panel', panelId: panel.id },
    });
  }
}

export function registerConversationDecoration(api, conversationId, label = 'Legion') {
  api.ui.showConversationDecoration({
    id: `conversation:${conversationId}`,
    conversationId,
    label,
    variant: label === 'GAIA' ? 'success' : 'info',
    visible: true,
  });
}

export async function createManagedConversation(api, options = {}) {
  const config = getPluginConfig(api);
  const kind = cleanText(options.kind) || 'workspace';
  const conversationId = kind === 'proactive' ? PROACTIVE_THREAD_ID : randomUUID();
  const now = new Date().toISOString();
  const title = cleanText(options.title) || (kind === 'proactive' ? config.proactiveThreadTitle : config.workspaceThreadTitle);
  const initialPrompt = cleanText(options.prompt) || (kind === 'proactive' ? `${config.proactivePromptPrefix}.` : config.bootstrapPrompt);
  const selectedBackendKey = kind === 'proactive' ? null : (config.backendEnabled ? BACKEND_KEY : null);

  const existing = api.conversations.get(conversationId);
  api.conversations.upsert({
    id: conversationId,
    title,
    fallbackTitle: title,
    messages: existing?.messages || [],
    messageTree: existing?.messageTree || [],
    headId: existing?.headId || null,
    conversationCompaction: null,
    lastContextUsage: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastMessageAt: existing?.lastMessageAt || null,
    titleStatus: 'ready',
    titleUpdatedAt: now,
    messageCount: existing?.messageCount || 0,
    userMessageCount: existing?.userMessageCount || 0,
    runStatus: 'idle',
    hasUnread: existing?.hasUnread || false,
    lastAssistantUpdateAt: existing?.lastAssistantUpdateAt || null,
    selectedModelKey: existing?.selectedModelKey || null,
    selectedProfileKey: existing?.selectedProfileKey || null,
    fallbackEnabled: existing?.fallbackEnabled || false,
    profilePrimaryModelKey: existing?.profilePrimaryModelKey || null,
    currentWorkingDirectory: existing?.currentWorkingDirectory || null,
    selectedBackendKey,
    metadata: {
      ...(existing?.metadata || {}),
      pluginName: 'legion',
      source: 'legion-plugin',
      legionKind: kind,
      serviceUrl: config.daemonUrl || null,
    },
  });

  managedConversationIds.add(conversationId);
  registerConversationDecoration(api, conversationId, kind === 'proactive' ? 'GAIA' : 'Legion');

  if (initialPrompt && (!existing || (existing.messageCount || 0) === 0)) {
    api.conversations.appendMessage(conversationId, {
      role: 'assistant',
      content: [{ type: 'text', text: initialPrompt }],
      metadata: {
        pluginName: 'legion',
        kind: `${kind}-bootstrap`,
      },
      createdAt: now,
    });
  }

  if (options.open !== false) {
    api.conversations.setActive(conversationId);
  }

  const nextState = replaceState(api, {
    managedConversationIds: [...managedConversationIds],
    lastConversationId: conversationId,
    lastConversationTitle: title,
    proactiveConversationId: kind === 'proactive'
      ? conversationId
      : getCurrentState(api).proactiveConversationId ?? null,
  }, {
    reason: 'conversation-created',
    recordHistory: true,
  });

  updateNavigationItems(api, nextState);

  api.state.emitEvent('conversation-created', {
    conversationId,
    title,
    selectedBackendKey,
    kind,
  });

  if (config.notificationsEnabled && kind !== 'proactive') {
    api.notifications.show({
      id: `conversation-${conversationId}`,
      title: 'Legion thread created',
      body: `${title}${selectedBackendKey ? ' using Legion backend' : ''}`,
      level: 'info',
      native: false,
      autoDismissMs: 4_000,
      target: { type: 'conversation', conversationId },
    });
  }

  return {
    ok: true,
    conversationId,
    title,
    selectedBackendKey,
    state: nextState,
  };
}

export async function ensureProactiveConversation(api) {
  const existing = api.conversations.get(PROACTIVE_THREAD_ID);
  if (existing) {
    managedConversationIds.add(existing.id);
    registerConversationDecoration(api, existing.id, 'GAIA');
    const state = replaceState(api, {
      proactiveConversationId: existing.id,
      managedConversationIds: [...managedConversationIds],
    });
    updateNavigationItems(api, state);
    return existing.id;
  }

  const created = await createManagedConversation(api, {
    kind: 'proactive',
    open: false,
  });
  return created.conversationId;
}

export async function openProactiveConversation(api) {
  const conversationId = await ensureProactiveConversation(api);
  api.conversations.setActive(conversationId);
  return { ok: true, conversationId };
}

async function appendProactiveMessage(api, proactiveMessage) {
  const conversationId = await ensureProactiveConversation(api);
  const conversation = api.conversations.get(conversationId);
  const messageTree = Array.isArray(conversation?.messageTree) ? conversation.messageTree : [];

  if (messageTree.some((entry) => entry?.metadata?.eventId === proactiveMessage.id)) {
    return { ok: true, duplicate: true, conversationId };
  }

  api.conversations.appendMessage(conversationId, {
    role: 'assistant',
    content: [{ type: 'text', text: proactiveMessage.content }],
    metadata: {
      pluginName: 'legion',
      legionKind: 'proactive',
      eventId: proactiveMessage.id,
      intent: proactiveMessage.intent,
      source: proactiveMessage.source,
      ...proactiveMessage.metadata,
    },
    createdAt: proactiveMessage.timestamp,
  });
  api.conversations.markUnread(conversationId, true);

  const state = updateState(api, (previous) => ({
    ...previous,
    proactiveConversationId: conversationId,
    proactiveMessages: [
      proactiveMessage,
      ...(Array.isArray(previous.proactiveMessages) ? previous.proactiveMessages : []),
    ],
  }), {
    reason: 'proactive-message',
    recordHistory: false,
  });

  const config = getPluginConfig(api);
  if (config.openProactiveThread) {
    api.navigation.open({ type: 'conversation', conversationId });
  }

  updateNavigationItems(api, state);
  return { ok: true, conversationId, state };
}

export async function refreshDashboardSnapshot(api, options = {}) {
  const config = getPluginConfig(api);
  const [
    readyResult,
    healthResult,
    tasksResult,
    workersResult,
    extensionsResult,
    gaiaResult,
    meteringResult,
    capabilitiesResult,
    githubStatusResult,
    knowledgeStatusResult,
  ] = await Promise.all([
    daemonJson(api, config.readyPath, { quiet: true }),
    daemonJson(api, config.healthPath, { quiet: true }),
    daemonJson(api, '/api/tasks', { quiet: true }),
    daemonJson(api, '/api/workers', { quiet: true }),
    daemonJson(api, '/api/extensions', { quiet: true }),
    daemonJson(api, '/api/gaia/status', { quiet: true }),
    daemonJson(api, '/api/metering', { quiet: true }),
    daemonJson(api, '/api/capabilities', { quiet: true }),
    daemonJson(api, '/api/github/status', { quiet: true }),
    daemonJson(api, '/api/apollo/status', { quiet: true }),
  ]);

  const snapshot = {
    updatedAt: new Date().toISOString(),
    readyOk: Boolean(readyResult.ok),
    healthOk: Boolean(healthResult.ok),
    ready: readyResult.data ?? null,
    health: healthResult.data ?? null,
    tasksSummary: summarizeTasks(tasksResult.data),
    workersSummary: summarizeWorkers(workersResult.data),
    extensionsCount: Array.isArray(extensionsResult.data) ? extensionsResult.data.length : 0,
    gaia: gaiaResult.data ?? null,
    metering: meteringResult.data ?? null,
    capabilities: extractCapabilities(capabilitiesResult.data),
    githubStatus: githubStatusResult.data ?? null,
    knowledgeStatus: knowledgeStatusResult.data ?? null,
  };

  const ok = snapshot.readyOk || snapshot.healthOk;
  const error = readyResult.error || healthResult.error || tasksResult.error || workersResult.error || null;

  if (options.persist !== false) {
    const state = replaceState(api, { dashboard: snapshot });
    updateNavigationItems(api, state);
  }

  return { ok, error, snapshot };
}

function summarizeTasks(data) {
  const items = Array.isArray(data) ? data : [];
  return {
    total: items.length,
    running: items.filter((item) => matchesAnyStatus(item?.status, ['running', 'active', 'queued'])).length,
    completed: items.filter((item) => matchesAnyStatus(item?.status, ['completed', 'done', 'resolved'])).length,
    failed: items.filter((item) => matchesAnyStatus(item?.status, ['failed', 'error'])).length,
  };
}

function summarizeWorkers(data) {
  const items = Array.isArray(data) ? data : [];
  return {
    total: items.length,
    healthy: items.filter((item) => matchesAnyStatus(item?.status, ['healthy', 'active', 'running'])).length,
    degraded: items.filter((item) => matchesAnyStatus(item?.status, ['degraded', 'unhealthy', 'warning'])).length,
  };
}

function extractCapabilities(data) {
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.capabilities)
      ? data.capabilities
      : [];
  return items.slice(0, 20);
}

function matchesAnyStatus(status, expected) {
  const normalized = cleanText(status).toLowerCase();
  return expected.includes(normalized);
}

export async function loadRecentEvents(api, options = {}) {
  const config = getPluginConfig(api);
  const count = clampNumber(options.count, 1, MAX_NOTIFICATIONS, config.eventsRecentCount);
  const result = await daemonJson(api, '/api/events/recent', {
    quiet: options.initial === true,
    query: { count: String(count) },
  });
  if (!result.ok) return result;

  const rawItems = Array.isArray(result.data)
    ? result.data
    : Array.isArray(result.data?.events)
      ? result.data.events
      : [];

  const incoming = rawItems.map((event) => ({
    ...classifyDaemonEvent(event),
    read: options.initial === true,
  }));

  const state = updateState(api, (previous) => ({
    ...previous,
    notifications: mergeNotifications(previous.notifications, incoming),
  }), {
    reason: options.initial === true ? 'events-hydrated' : 'events-refreshed',
    recordHistory: false,
  });

  updateNavigationItems(api, state);
  return { ok: true, data: state.notifications };
}

function mergeNotifications(existingValue, incomingValue) {
  const combined = [
    ...(Array.isArray(incomingValue) ? incomingValue : []),
    ...(Array.isArray(existingValue) ? existingValue : []),
  ];
  return normalizeNotifications(combined);
}

export function stopEventStream() {
  if (runtimeState.eventsReconnectTimer) {
    clearTimeout(runtimeState.eventsReconnectTimer);
    runtimeState.eventsReconnectTimer = null;
  }
  if (runtimeState.eventsController) {
    runtimeState.eventsController.abort();
    runtimeState.eventsController = null;
  }
}

export function ensureEventStream(api) {
  const config = getPluginConfig(api);
  const state = getCurrentState(api);
  const shouldConnect = Boolean(config.enabled && config.autoConnectEvents && config.daemonUrl && state.status !== 'disabled' && state.status !== 'unconfigured');

  if (!shouldConnect) {
    stopEventStream();
    const next = replaceState(api, { eventsConnected: false });
    updateNavigationItems(api, next);
    return;
  }

  if (runtimeState.eventsController || runtimeState.eventsReconnectTimer) return;

  const controller = new AbortController();
  runtimeState.eventsController = controller;
  void connectEventStream(api, controller);
}

async function connectEventStream(api, controller) {
  const config = getPluginConfig(api);
  const url = joinUrl(config.daemonUrl, config.eventsPath);

  try {
    const response = await fetchWithTimeout(api, url, {
      method: 'GET',
      headers: buildDaemonHeaders(config, { accept: 'text/event-stream' }),
      signal: controller.signal,
    }, DEFAULT_TIMEOUT_MS);

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const next = replaceState(api, {
      eventsConnected: true,
      eventsConnectedAt: new Date().toISOString(),
      eventsLastError: null,
    });
    updateNavigationItems(api, next);

    await consumeServerSentEvents(api, response.body, controller.signal);
    if (!controller.signal.aborted) {
      throw new Error('Event stream ended.');
    }
  } catch (error) {
    if (controller.signal.aborted) return;

    const message = error instanceof Error ? error.message : String(error);
    const next = replaceState(api, {
      eventsConnected: false,
      eventsLastError: message,
      eventsLastDisconnectedAt: new Date().toISOString(),
    });
    updateNavigationItems(api, next);
    scheduleEventReconnect(api);
  } finally {
    if (runtimeState.eventsController === controller) {
      runtimeState.eventsController = null;
    }
  }
}

function scheduleEventReconnect(api) {
  if (runtimeState.eventsReconnectTimer) return;

  const delay = clampNumber(getPluginConfig(api).sseReconnectMs, EVENT_RECONNECT_MIN_MS, EVENT_RECONNECT_MAX_MS, DEFAULTS.sseReconnectMs);
  runtimeState.eventsReconnectTimer = setTimeout(() => {
    runtimeState.eventsReconnectTimer = null;
    ensureEventStream(api);
  }, delay);
}

async function consumeServerSentEvents(api, body, abortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines = [];

  const flush = async () => {
    const rawData = dataLines.join('\n').trim();
    const explicitEventName = eventName;
    eventName = '';
    dataLines = [];

    if (!rawData || rawData === '[DONE]') return;

    let payload = rawData;
    try {
      payload = JSON.parse(rawData);
    } catch {}

    const normalized = normalizeDaemonSsePayload(explicitEventName, payload);
    for (const entry of normalized) {
      await onDaemonEvent(api, entry);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '');
        if (!trimmed) {
          await flush();
          continue;
        }
        if (trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('event:')) {
          eventName = trimmed.slice(6).trim();
          continue;
        }
        if (trimmed.startsWith('data:')) {
          dataLines.push(trimmed.slice(5).trimStart());
        }
      }
    }

    if (buffer.trim()) {
      const trailing = buffer.replace(/\r$/, '');
      if (trailing.startsWith('event:')) {
        eventName = trailing.slice(6).trim();
      } else if (trailing.startsWith('data:')) {
        dataLines.push(trailing.slice(5).trimStart());
      }
      await flush();
    }
  } finally {
    reader.releaseLock();
    if (!abortSignal.aborted) {
      const next = replaceState(api, {
        eventsConnected: false,
        eventsLastDisconnectedAt: new Date().toISOString(),
      });
      updateNavigationItems(api, next);
    }
  }
}

function normalizeDaemonSsePayload(eventName, payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.events)) {
    return payload.events;
  }
  if (payload && typeof payload === 'object') {
    return [{ ...(eventName ? { __eventName: eventName } : {}), ...payload }];
  }
  return [{ type: eventName || 'event', message: String(payload) }];
}

async function onDaemonEvent(api, rawEvent) {
  const notification = classifyDaemonEvent(rawEvent);

  const state = updateState(api, (previous) => ({
    ...previous,
    notifications: mergeNotifications(previous.notifications, [notification]),
    eventsConnected: true,
    eventsLastEventAt: notification.timestamp,
  }), {
    reason: 'daemon-event',
    recordHistory: false,
  });

  updateNavigationItems(api, state);

  const proactiveMessage = buildProactiveMessage(rawEvent, notification);
  if (proactiveMessage) {
    await appendProactiveMessage(api, proactiveMessage);
  }

  await maybeHandleTriggerEvent(api, rawEvent);

  const config = getPluginConfig(api);
  if (config.notificationsEnabled && (notification.severity === 'error' || TOAST_TYPES.has(notification.type))) {
    api.notifications.show({
      id: `event-${notification.id}`,
      title: notification.title,
      body: notification.message,
      level: toNotificationLevel(notification.severity),
      native: config.nativeNotifications,
      autoDismissMs: 6_000,
      target: proactiveMessage
        ? { type: 'conversation', conversationId: PROACTIVE_THREAD_ID }
        : { type: 'panel', panelId: 'notifications' },
    });
  }

  api.state.emitEvent('daemon-event', {
    event: rawEvent,
    notification,
  });
}

function classifyDaemonEvent(raw) {
  const event = raw && typeof raw === 'object' ? raw : {};
  const type = cleanText(event.type || event.event || event.kind || event.__eventName) || 'event';
  const severityHint = cleanText(event.severity || event.level || event.status).toLowerCase();
  const severity = SEVERITY_MAP[severityHint]
    || (type.includes('error') || type.includes('fail') ? 'error' : type.includes('warn') || type.includes('degrad') ? 'warn' : type.includes('success') || type.includes('complet') ? 'success' : 'info');

  return {
    id: cleanText(event.id) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity,
    title: cleanText(event.title || event.summary) || type.replace(/[._]/g, ' '),
    message: typeof event.message === 'string'
      ? event.message
      : typeof event.description === 'string'
        ? event.description
        : typeof event.details === 'string'
          ? event.details
          : typeof event.content === 'string'
            ? event.content
            : '',
    source: cleanText(event.source || event.extension || event.worker_id) || '',
    timestamp: cleanText(event.timestamp || event.created_at) || new Date().toISOString(),
    read: false,
    raw,
  };
}

function buildProactiveMessage(rawEvent, notification) {
  const event = rawEvent && typeof rawEvent === 'object' ? rawEvent : {};
  const eventType = cleanText(event.type || event.event || event.kind || event.__eventName);
  if (!eventType.startsWith('proactive.') && eventType !== 'gaia.proactive') {
    return null;
  }

  const content = cleanText(event.content || event.message || event.text || notification.message || notification.title);
  if (!content) return null;

  return {
    id: notification.id,
    intent: cleanText(event.intent || eventType) || 'insight',
    content,
    source: cleanText(event.source) || 'gaia',
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
    timestamp: notification.timestamp,
  };
}

async function maybeHandleTriggerEvent(api, rawEvent) {
  const event = rawEvent && typeof rawEvent === 'object' ? rawEvent : {};
  const type = cleanText(event.type || event.event || event.kind || event.__eventName);
  if (!type.startsWith('trigger.')) return;

  const config = getPluginConfig(api);
  if (!config.triggersEnabled) return;

  const envelope = {
    type,
    source: cleanText(event.source) || 'unknown',
    eventType: cleanText(event.event_type) || type.replace(/^trigger\./, ''),
    payload: event.payload ?? event.data ?? {},
  };

  const action = triageEvent(envelope, config);
  if (action === 'ignore') return;

  const currentWorkflows = [...workflowStore.values()];
  const activeCount = currentWorkflows.filter((workflow) => workflow.status === 'pending' || workflow.status === 'running').length;
  if (activeCount >= config.maxConcurrentWorkflows) {
    return;
  }

  const workflow = {
    id: randomUUID(),
    source: envelope.source,
    eventType: envelope.eventType,
    action,
    status: 'pending',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    payload: envelope.payload,
    summary: `${action} ${envelope.source}:${envelope.eventType}`,
    taskId: '',
    error: '',
  };

  persistWorkflow(api, workflow);

  if (action === 'observe') {
    await routeObservedTrigger(api, workflow, envelope);
    return;
  }

  await routeActionTrigger(api, workflow, envelope);
}

function triageEvent(envelope, config) {
  for (const rule of config.triggerRules) {
    if (!matchesGlob(cleanText(rule.source) || '*', envelope.source)) continue;
    if (!matchesGlob(cleanText(rule.eventType) || '*', envelope.eventType)) continue;
    if (cleanText(rule.filter)) {
      try {
        const regex = new RegExp(rule.filter);
        const serializedPayload = typeof envelope.payload === 'string' ? envelope.payload : JSON.stringify(envelope.payload);
        if (!regex.test(serializedPayload)) continue;
      } catch {
        continue;
      }
    }
    return cleanText(rule.action) || 'observe';
  }

  return config.autoTriage ? 'observe' : 'ignore';
}

function matchesGlob(pattern, value) {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === value;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

async function routeObservedTrigger(api, workflow, envelope) {
  const result = await daemonJson(api, '/api/gaia/buffer', {
    method: 'POST',
    body: {
      type: 'trigger_observation',
      source: envelope.source,
      event_type: envelope.eventType,
      payload: envelope.payload,
      observed_at: new Date().toISOString(),
    },
  });

  updateWorkflow(api, workflow.id, {
    status: result.ok ? 'resolved' : 'failed',
    updatedAt: new Date().toISOString(),
    error: result.ok ? '' : (result.error || 'Observation failed'),
  });
}

async function routeActionTrigger(api, workflow, envelope) {
  const config = getPluginConfig(api);
  const message = [
    'A trigger event has fired and requires action.',
    `Source: ${envelope.source}`,
    `Event type: ${envelope.eventType}`,
    `Payload:\n\`\`\`json\n${safeStringify(envelope.payload, 2)}\n\`\`\``,
    'Please assess the situation and take appropriate action.',
  ].join('\n');

  const result = await daemonJson(api, config.streamPath, {
    method: 'POST',
    body: {
      messages: [{ role: 'user', content: message }],
      ...(config.triageModel ? { model: config.triageModel } : {}),
      sub_agent: true,
    },
    timeoutMs: 30_000,
  });

  const taskId = cleanText(result.data?.id || result.data?.task_id);
  updateWorkflow(api, workflow.id, {
    status: result.ok ? 'running' : 'failed',
    updatedAt: new Date().toISOString(),
    taskId,
    error: result.ok ? '' : (result.error || 'Failed to create sub-agent workflow'),
  });
}

function persistWorkflow(api, workflow) {
  workflowStore.set(workflow.id, workflow);
  const state = replaceState(api, {
    workflows: [...workflowStore.values()],
  }, {
    reason: 'workflow-updated',
    recordHistory: false,
  });
  updateNavigationItems(api, state);
}

function updateWorkflow(api, workflowId, patch) {
  const existing = workflowStore.get(workflowId);
  if (!existing) return null;
  const next = {
    ...existing,
    ...patch,
  };
  workflowStore.set(workflowId, next);
  const state = replaceState(api, {
    workflows: [...workflowStore.values()],
  }, {
    reason: 'workflow-updated',
    recordHistory: false,
  });
  updateNavigationItems(api, state);
  return next;
}

export async function refreshWorkflowTasks(api, options = {}) {
  const activeWorkflows = [...workflowStore.values()].filter((workflow) => workflow.taskId && ['pending', 'running', 'needs-input'].includes(workflow.status));
  if (activeWorkflows.length === 0) {
    if (!options.quiet) {
      const state = replaceState(api, { workflows: [...workflowStore.values()] });
      updateNavigationItems(api, state);
    }
    return { ok: true, data: [...workflowStore.values()] };
  }

  for (const workflow of activeWorkflows) {
    const taskResult = await daemonJson(api, `/api/tasks/${encodeURIComponent(workflow.taskId)}`, { quiet: true });
    if (!taskResult.ok) continue;

    const nextStatus = normalizeWorkflowStatus(taskResult.data);
    updateWorkflow(api, workflow.id, {
      status: nextStatus.status,
      updatedAt: new Date().toISOString(),
      summary: nextStatus.summary || workflow.summary,
      error: nextStatus.error || '',
    });
  }

  return { ok: true, data: [...workflowStore.values()] };
}

function normalizeWorkflowStatus(taskData) {
  const status = cleanText(taskData?.status).toLowerCase();
  if (['needs_input', 'awaiting_input', 'awaiting-response'].includes(status)) {
    return {
      status: 'needs-input',
      summary: cleanText(taskData?.message || taskData?.summary) || 'Awaiting input',
      error: '',
    };
  }
  if (['completed', 'done', 'resolved'].includes(status)) {
    return {
      status: 'resolved',
      summary: cleanText(taskData?.summary || taskData?.message) || 'Workflow resolved',
      error: '',
    };
  }
  if (['failed', 'error'].includes(status)) {
    return {
      status: 'failed',
      summary: cleanText(taskData?.summary || taskData?.message) || 'Workflow failed',
      error: cleanText(taskData?.error || taskData?.message),
    };
  }
  return {
    status: 'running',
    summary: cleanText(taskData?.summary || taskData?.message) || 'Workflow running',
    error: '',
  };
}

export async function markAllNotificationsRead(api) {
  const state = replaceState(api, {
    notifications: normalizeNotifications(getCurrentState(api).notifications).map((notification) => ({
      ...notification,
      read: true,
    })),
  }, {
    reason: 'notifications-read',
    recordHistory: false,
  });
  updateNavigationItems(api, state);
  return { ok: true, data: state.notifications };
}

export async function clearNotifications(api) {
  const state = replaceState(api, {
    notifications: [],
  }, {
    reason: 'notifications-cleared',
    recordHistory: false,
  });
  updateNavigationItems(api, state);
  return { ok: true, data: state.notifications };
}

export async function setNotificationReadState(api, id, read) {
  if (!id) return { ok: false, error: 'Notification id is required.' };
  const state = replaceState(api, {
    notifications: normalizeNotifications(getCurrentState(api).notifications).map((notification) => (
      notification.id === id ? { ...notification, read } : notification
    )),
  }, {
    reason: 'notification-updated',
    recordHistory: false,
  });
  updateNavigationItems(api, state);
  return { ok: true, data: state.notifications };
}
