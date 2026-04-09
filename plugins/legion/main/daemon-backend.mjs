import { createHmac, randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

import {
  BACKEND_KEY,
  DEFAULT_TIMEOUT_MS,
  cleanText,
  clampNumber,
  getPluginConfig,
  getResolvedConfigDir,
  replaceState,
  runtimeState,
  sleep,
} from './shared.mjs';

export function ensureBackendRegistration(api, config) {
  const shouldRegister = Boolean(config.enabled && config.backendEnabled && config.daemonUrl);
  if (shouldRegister && !runtimeState.backendRegistered) {
    api.agent.registerBackend({
      key: BACKEND_KEY,
      displayName: 'Legion',
      isAvailable: () => {
        const currentConfig = getPluginConfig(api);
        return Boolean(currentConfig.enabled && currentConfig.backendEnabled && currentConfig.daemonUrl);
      },
      stream: async function* (options) {
        yield* streamFromDaemon(api, options);
      },
    });
    runtimeState.backendRegistered = true;
    api.state.emitEvent('backend-registered', { key: BACKEND_KEY });
    return;
  }

  if (!shouldRegister && runtimeState.backendRegistered) {
    api.agent.unregisterBackend(BACKEND_KEY);
    runtimeState.backendRegistered = false;
    api.state.emitEvent('backend-unregistered', { key: BACKEND_KEY });
  }
}

async function* streamFromDaemon(api, options) {
  const config = getPluginConfig(api);
  if (!config.daemonUrl) {
    yield {
      conversationId: options.conversationId,
      type: 'error',
      error: 'Legion daemon URL is not configured.',
    };
    yield { conversationId: options.conversationId, type: 'done' };
    return;
  }

  const readyResult = await daemonJson(api, config.readyPath, {
    quiet: true,
    signal: options.abortSignal,
  });
  if (!readyResult.ok) {
    yield {
      conversationId: options.conversationId,
      type: 'error',
      error: `Legion daemon is not ready at ${config.daemonUrl}: ${readyResult.error || 'unknown error'}`,
    };
    yield { conversationId: options.conversationId, type: 'done' };
    return;
  }

  const normalizedMessages = normalizeMessages(options.messages);
  if (!normalizedMessages.some((message) => message.role === 'user')) {
    yield {
      conversationId: options.conversationId,
      type: 'error',
      error: 'No user message was provided to the Legion backend.',
    };
    yield { conversationId: options.conversationId, type: 'done' };
    return;
  }

  const requestBody = {
    messages: normalizedMessages,
    ...(options.tools?.length ? {
      tools: await Promise.all(options.tools.map(async (tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: await zodSchemaToJson(tool.inputSchema),
      }))),
    } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    rag_enabled: config.knowledgeRagEnabled,
    capture_enabled: config.knowledgeCaptureEnabled,
    knowledge_scope: config.knowledgeScope,
  };

  if (config.daemonStreaming !== false) {
    let response;
    try {
      response = await fetchWithTimeout(api, joinUrl(config.daemonUrl, config.streamPath), {
        method: 'POST',
        headers: buildDaemonHeaders(config, {
          accept: 'text/event-stream',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({ ...requestBody, stream: true }),
        signal: options.abortSignal,
      }, 60_000);
    } catch (error) {
      yield {
        conversationId: options.conversationId,
        type: 'error',
        error: `Legion daemon streaming request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { conversationId: options.conversationId, type: 'done' };
      return;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (response.ok && contentType.includes('text/event-stream') && response.body) {
      yield* consumeDaemonInferenceSse(options.conversationId, response.body, options.abortSignal);
      return;
    }

    yield* handleDaemonSyncResponse(api, options.conversationId, response, options.abortSignal);
    return;
  }

  const response = await fetchWithTimeout(api, joinUrl(config.daemonUrl, config.streamPath), {
    method: 'POST',
    headers: buildDaemonHeaders(config, {
      'content-type': 'application/json',
      'x-kai-sync': 'true',
    }),
    body: JSON.stringify(requestBody),
    signal: options.abortSignal,
  }, 60_000);

  yield* handleDaemonSyncResponse(api, options.conversationId, response, options.abortSignal);
}

async function loadZodToJsonSchema() {
  if (runtimeState.zodToJsonSchemaModule) return runtimeState.zodToJsonSchemaModule;
  if (runtimeState.zodToJsonSchemaPromise) return runtimeState.zodToJsonSchemaPromise;

  const candidatePaths = [
    join(process.cwd(), 'node_modules', 'zod-to-json-schema', 'dist/esm/index.js'),
    process.resourcesPath
      ? join(process.resourcesPath, 'app.asar', 'node_modules', 'zod-to-json-schema', 'dist/esm/index.js')
      : '',
    process.resourcesPath
      ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'zod-to-json-schema', 'dist/esm/index.js')
      : '',
    process.resourcesPath
      ? join(process.resourcesPath, 'node_modules', 'zod-to-json-schema', 'dist/esm/index.js')
      : '',
  ].filter(Boolean);

  runtimeState.zodToJsonSchemaPromise = (async () => {
    for (const candidatePath of candidatePaths) {
      if (!existsSync(candidatePath)) continue;
      try {
        const module = await import(pathToFileURL(candidatePath).href);
        runtimeState.zodToJsonSchemaModule = module.default || module;
        return runtimeState.zodToJsonSchemaModule;
      } catch {}
    }
    return null;
  })().finally(() => {
    runtimeState.zodToJsonSchemaPromise = null;
  });

  return runtimeState.zodToJsonSchemaPromise;
}

async function zodSchemaToJson(schema) {
  if (!schema || typeof schema !== 'object') return {};
  if (typeof schema.safeParse === 'function') {
    try {
      const converter = await loadZodToJsonSchema();
      if (typeof converter !== 'function') return {};
      return converter(schema, {
        $refStrategy: 'none',
        target: 'jsonSchema7',
      });
    } catch {
      return {};
    }
  }
  return schema;
}

function normalizeMessages(messages) {
  const items = Array.isArray(messages) ? messages : [];
  return items
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : '';
      if (!role) return null;
      const text = extractMessageText(message.content);
      if (!text) return null;
      return { role, content: [{ type: 'text', text }] };
    })
    .filter(Boolean);
}

function extractMessageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (!part || typeof part !== 'object') return '';
    switch (part.type) {
      case 'text':
        return part.text || '';
      case 'image':
        return '[Image]';
      case 'file':
        return part.filename ? `[File: ${part.filename}]` : '[File]';
      case 'tool-call': {
        const lines = [`[Tool call: ${part.toolName || 'unknown'}]`];
        if (part.args !== undefined) lines.push(`Args: ${stringifyValue(part.args, 1_000)}`);
        if (part.result !== undefined) lines.push(`Result: ${stringifyValue(part.result, 1_500)}`);
        return lines.join('\n');
      }
      default:
        return '';
    }
  }).filter(Boolean).join('\n').trim();
}

function stringifyValue(value, maxLength = 2_000) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof text !== 'string') return String(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value);
  }
}

async function* consumeDaemonInferenceSse(conversationId, body, abortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedAny = false;
  let currentEventName = '';
  let currentDataLines = [];

  const flush = async () => {
    if (!currentEventName && currentDataLines.length === 0) return [];
    const rawData = currentDataLines.join('\n').trim();
    const explicitEventName = currentEventName;
    currentEventName = '';
    currentDataLines = [];
    if (!rawData || rawData === '[DONE]') return [];

    let payload;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return [{ conversationId, type: 'text-delta', text: rawData }];
    }

    return normalizeInferenceEvent(explicitEventName, payload, conversationId);
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
          const events = await flush();
          for (const event of events) {
            emittedAny = true;
            yield event;
          }
          continue;
        }
        if (trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('event:')) {
          currentEventName = trimmed.slice(6).trim();
          continue;
        }
        if (trimmed.startsWith('data:')) {
          currentDataLines.push(trimmed.slice(5).trimStart());
        }
      }
    }

    if (buffer.trim()) {
      const trailing = buffer.replace(/\r$/, '');
      if (trailing.startsWith('event:')) currentEventName = trailing.slice(6).trim();
      if (trailing.startsWith('data:')) currentDataLines.push(trailing.slice(5).trimStart());
    }

    const trailingEvents = await flush();
    for (const event of trailingEvents) {
      emittedAny = true;
      yield event;
    }
  } catch (error) {
    if (!abortSignal?.aborted) {
      yield {
        conversationId,
        type: 'error',
        error: `SSE stream error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } finally {
    reader.releaseLock();
  }

  if (!emittedAny && !abortSignal?.aborted) {
    yield {
      conversationId,
      type: 'error',
      error: 'Legion daemon SSE stream ended without producing any output.',
    };
  }
  yield { conversationId, type: 'done' };
}

function normalizeInferenceEvent(eventName, payload, conversationId) {
  const normalizedName = normalizeDaemonEventName(eventName, payload);
  if (!normalizedName) return [];

  if (['text-delta', 'text_delta', 'delta'].includes(normalizedName)) {
    const text = payload.text || payload.delta || '';
    return text ? [{ conversationId, type: 'text-delta', text }] : [];
  }

  if (['tool-call', 'tool_call'].includes(normalizedName)) {
    return [{
      conversationId,
      type: 'tool-call',
      toolCallId: payload.toolCallId || payload.tool_call_id,
      toolName: payload.toolName || payload.tool_name,
      args: payload.args || payload.parameters || {},
      startedAt: toIsoTimestamp(payload.startedAt || payload.started_at || payload.timestamp) || new Date().toISOString(),
      messageMeta: extractMessageMeta(payload),
    }];
  }

  if (['tool-result', 'tool_result'].includes(normalizedName)) {
    return [{
      conversationId,
      type: 'tool-result',
      toolCallId: payload.toolCallId || payload.tool_call_id,
      toolName: payload.toolName || payload.tool_name,
      result: payload.result ?? payload.content,
      startedAt: toIsoTimestamp(payload.startedAt || payload.started_at) || undefined,
      finishedAt: toIsoTimestamp(payload.finishedAt || payload.finished_at || payload.timestamp) || new Date().toISOString(),
      durationMs: numberOrUndefined(payload.durationMs ?? payload.duration_ms),
      messageMeta: extractMessageMeta(payload),
    }];
  }

  if (['tool-error', 'tool_error'].includes(normalizedName)) {
    return [{
      conversationId,
      type: 'tool-result',
      toolCallId: payload.toolCallId || payload.tool_call_id,
      toolName: payload.toolName || payload.tool_name,
      result: { isError: true, error: payload.error || payload.message || 'Tool execution failed' },
      startedAt: toIsoTimestamp(payload.startedAt || payload.started_at) || undefined,
      finishedAt: toIsoTimestamp(payload.finishedAt || payload.finished_at || payload.timestamp) || new Date().toISOString(),
      messageMeta: extractMessageMeta(payload),
    }];
  }

  if (['tool-progress', 'tool_progress'].includes(normalizedName)) {
    return [{
      conversationId,
      type: 'tool-progress',
      toolCallId: payload.toolCallId || payload.tool_call_id,
      toolName: payload.toolName || payload.tool_name,
      data: payload,
      messageMeta: extractMessageMeta(payload),
    }];
  }

  if (normalizedName === 'error') {
    return [{
      conversationId,
      type: 'error',
      error: payload.error || payload.message || 'Daemon stream error',
    }];
  }

  if (['enrichment', 'enrichments'].includes(normalizedName)) {
    return [{ conversationId, type: 'enrichment', data: payload }];
  }

  if (normalizedName === 'done') {
    const events = [];
    const enrichments = payload.enrichments || payload.pipeline_enrichments;
    if (enrichments && typeof enrichments === 'object' && !Array.isArray(enrichments)) {
      events.push({ conversationId, type: 'enrichment', data: enrichments });
    }
    const inputTokens = numberOrUndefined(payload.input_tokens ?? payload.inputTokens);
    const outputTokens = numberOrUndefined(payload.output_tokens ?? payload.outputTokens);
    const cacheReadTokens = numberOrUndefined(payload.cache_read_tokens ?? payload.cacheReadTokens);
    const cacheWriteTokens = numberOrUndefined(payload.cache_write_tokens ?? payload.cacheWriteTokens);
    if (inputTokens !== undefined || outputTokens !== undefined) {
      events.push({
        conversationId,
        type: 'context-usage',
        data: {
          inputTokens: inputTokens ?? 0,
          outputTokens: outputTokens ?? 0,
          cacheReadTokens: cacheReadTokens ?? 0,
          cacheWriteTokens: cacheWriteTokens ?? 0,
          totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
        },
      });
    }
    events.push({ conversationId, type: 'done', data: payload });
    return events;
  }

  if (['context_usage', 'context-usage'].includes(normalizedName)) {
    return [{ conversationId, type: 'context-usage', data: payload }];
  }

  if (['model-fallback', 'model_fallback'].includes(normalizedName)) {
    return [{ conversationId, type: 'model-fallback', data: payload }];
  }

  if (
    normalizedName === 'conversation_compaction'
    || normalizedName === 'compaction_start'
    || normalizedName === 'compaction_complete'
    || normalizedName === 'compaction_error'
    || normalizedName === 'memory_processor_start'
    || normalizedName === 'memory_processor_complete'
    || normalizedName === 'memory_processor_error'
  ) {
    return [{ conversationId, type: 'compaction', data: { event: normalizedName, ...payload } }];
  }

  if (typeof payload.response === 'string') {
    return [{
      conversationId,
      type: 'text-delta',
      text: payload.response,
      messageMeta: extractMessageMeta(payload),
    }];
  }

  return [];
}

function normalizeDaemonEventName(eventName, payload) {
  if (cleanText(eventName)) return cleanText(eventName);
  return cleanText(payload.type);
}

function extractMessageMeta(payload) {
  const messageMeta = {};
  if (payload.parent_id != null) messageMeta.parentId = payload.parent_id;
  if (payload.sidechain != null) messageMeta.sidechain = payload.sidechain;
  if (payload.message_group_id != null) messageMeta.messageGroupId = payload.message_group_id;
  if (payload.agent_id != null) messageMeta.agentId = payload.agent_id;
  return Object.keys(messageMeta).length > 0 ? messageMeta : undefined;
}

async function* handleDaemonSyncResponse(api, conversationId, response, abortSignal) {
  const body = await parseResponseBody(response);

  if (response.status === 202) {
    const taskId = cleanText(body?.task_id || body?.data?.task_id || body?.id);
    if (taskId) {
      yield* pollDaemonTask(api, conversationId, taskId, abortSignal);
      return;
    }
    yield {
      conversationId,
      type: 'error',
      error: 'Legion daemon accepted the request asynchronously but returned no task id for polling.',
    };
    yield { conversationId, type: 'done' };
    return;
  }

  if (!response.ok) {
    yield {
      conversationId,
      type: 'error',
      error: extractErrorMessage(body)
        || (response.status === 401 || response.status === 403
          ? 'Legion daemon rejected the desktop request. Make sure daemon auth is configured or the cluster secret is readable from your config dir.'
          : `Legion daemon request failed with HTTP ${response.status}.`),
    };
    yield { conversationId, type: 'done' };
    return;
  }

  const text = typeof body?.data?.content === 'string'
    ? body.data.content
    : typeof body?.data?.response === 'string'
      ? body.data.response
      : typeof body?.response === 'string'
        ? body.response
        : '';

  if (text) {
    yield { conversationId, type: 'text-delta', text };
  } else {
    yield {
      conversationId,
      type: 'error',
      error: 'Legion daemon returned an unexpected response payload.',
    };
  }

  yield { conversationId, type: 'done' };
}

async function* pollDaemonTask(api, conversationId, taskId, abortSignal) {
  const maxAttempts = 120;
  let attempt = 0;

  yield {
    conversationId,
    type: 'text-delta',
    text: '_Waiting for Legion daemon to process request..._\n\n',
  };

  while (attempt < maxAttempts) {
    if (abortSignal?.aborted) {
      yield { conversationId, type: 'done' };
      return;
    }

    await sleep(1_000);
    attempt += 1;

    const response = await daemonJson(api, `/api/tasks/${encodeURIComponent(taskId)}`, {
      quiet: true,
      signal: abortSignal,
    });
    if (!response.ok) continue;

    const status = cleanText(response.data?.status).toLowerCase();
    if (['completed', 'done', 'resolved'].includes(status)) {
      const responseText = response.data?.result?.response;
      if (typeof responseText === 'string' && responseText) {
        yield { conversationId, type: 'text-delta', text: responseText };
      }
      yield { conversationId, type: 'done' };
      return;
    }

    if (['failed', 'error'].includes(status)) {
      yield {
        conversationId,
        type: 'error',
        error: response.data?.error || `Legion daemon task ${taskId} failed.`,
      };
      yield { conversationId, type: 'done' };
      return;
    }
  }

  yield {
    conversationId,
    type: 'error',
    error: `Legion daemon task ${taskId} did not complete within ${maxAttempts} seconds.`,
  };
  yield { conversationId, type: 'done' };
}

export async function daemonJson(api, path, options = {}) {
  const config = getPluginConfig(api);
  return daemonRequest(api, config, path, options);
}

export async function daemonAction(api, data, options = {}) {
  const path = cleanText(data?.path);
  if (!path) return { ok: false, error: 'A daemon path is required.' };

  const result = await daemonJson(api, path, {
    method: cleanText(data?.method).toUpperCase() || 'GET',
    query: data?.query && typeof data.query === 'object' ? data.query : undefined,
    body: data?.body,
    fallbackPath: cleanText(data?.fallbackPath) || undefined,
    timeoutMs: clampNumber(data?.timeoutMs, 1_000, 120_000, DEFAULT_TIMEOUT_MS),
    expectText: Boolean(data?.expectText),
    quiet: Boolean(data?.quiet),
  });

  if (result.ok && data?.refreshRuntime && typeof options.onRefreshRuntime === 'function') {
    void options.onRefreshRuntime();
  }
  return result;
}

async function daemonRequest(api, config, path, options = {}) {
  const primaryPath = path;
  const method = cleanText(options.method).toUpperCase() || 'GET';
  const accept = options.expectText ? 'application/json, text/plain' : 'application/json';

  let response = await daemonRequestOnce(api, config, primaryPath, {
    ...options,
    method,
    accept,
  });

  if (!response.ok && response.status === 404 && cleanText(options.fallbackPath)) {
    response = await daemonRequestOnce(api, config, options.fallbackPath, {
      ...options,
      method,
      accept,
      fallbackPath: undefined,
    });
  }

  if (!response.ok && !options.quiet) {
    replaceState(api, {
      lastError: response.error || `Request failed for ${primaryPath}`,
    });
  }

  return response;
}

async function daemonRequestOnce(api, config, path, options = {}) {
  const url = new URL(joinUrl(config.daemonUrl, path));
  const query = options.query && typeof options.query === 'object' ? options.query : {};
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const init = {
    method: options.method || 'GET',
    headers: buildDaemonHeaders(config, {
      accept: options.accept || 'application/json',
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
    }),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  };

  try {
    const response = await fetchWithTimeout(api, url.toString(), init, clampNumber(options.timeoutMs, 1_000, 120_000, DEFAULT_TIMEOUT_MS));
    const data = await parseResponseBody(response, options.expectText);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractErrorMessage(data) || `HTTP ${response.status}`,
        data,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: unwrapResultData(data),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}

export function buildDaemonHeaders(config, extraHeaders = {}) {
  const headers = {
    ...extraHeaders,
  };
  const token = resolveAuthToken(config);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function resolveAuthSource(config) {
  if (cleanText(config.apiKey)) return 'api-key';
  return resolveAuthToken(config) ? 'crypt.json' : 'none';
}

function resolveAuthToken(config) {
  if (cleanText(config.apiKey)) return cleanText(config.apiKey);

  const configDir = getResolvedConfigDir(config);
  const cryptPath = join(configDir, 'crypt.json');
  if (!existsSync(cryptPath)) return null;

  try {
    const raw = JSON.parse(readFileSync(cryptPath, 'utf-8'));
    const secret = cleanText(raw?.crypt?.cluster_secret);
    if (!secret) return null;

    const now = Math.floor(Date.now() / 1_000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: process.env.USER || process.env.USERNAME || 'kai',
      name: 'Kai Legion Plugin',
      roles: ['desktop'],
      scope: 'human',
      iss: 'kai-plugin',
      iat: now,
      exp: now + 3_600,
      jti: randomUUID(),
    })).toString('base64url');
    const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
  } catch {
    return null;
  }
}

export async function fetchWithTimeout(api, url, init, timeoutMs) {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const signal = mergeAbortSignals(init.signal, timeoutController.signal);
    return await api.fetch(url, {
      ...init,
      signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function mergeAbortSignals(primary, secondary) {
  if (!primary) return secondary;
  if (!secondary) return primary;

  const controller = new AbortController();
  const abort = () => controller.abort();

  if (primary.aborted || secondary.aborted) {
    controller.abort();
    return controller.signal;
  }

  primary.addEventListener('abort', abort, { once: true });
  secondary.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

export function joinUrl(baseUrl, relativePath) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  const normalizedPath = String(relativePath || '').startsWith('/')
    ? String(relativePath || '')
    : `/${String(relativePath || '')}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseResponseBody(response, expectText = false) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (expectText && !contentType.includes('application/json')) {
    return response.text();
  }

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapResultData(data) {
  if (data && typeof data === 'object' && 'data' in data) {
    return data.data;
  }
  return data;
}

function extractErrorMessage(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error && typeof payload.error === 'object' && typeof payload.error.message === 'string') {
    return payload.error.message;
  }
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.text === 'string') return payload.text;
  return null;
}

export function toNotificationLevel(severity) {
  return severity === 'warn' ? 'warning' : severity;
}

function toIsoTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return new Date(numeric).toISOString();
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export async function executeDaemonCommand(api, input) {
  if (!input) return { ok: false, error: 'Command text is required.' };
  const result = await daemonJson(api, '/api/do', {
    method: 'POST',
    body: { input },
  });

  replaceState(api, {
    lastCommandResult: {
      input,
      result: result.data ?? null,
      error: result.error || null,
      completedAt: new Date().toISOString(),
    },
  });

  return result;
}

export async function createDaemonSubAgent(api, options) {
  if (!options.message) return { ok: false, error: 'A message is required.' };
  return daemonJson(api, '/api/llm/inference', {
    method: 'POST',
    body: {
      messages: [{ role: 'user', content: options.message }],
      ...(options.model ? { model: options.model } : {}),
      sub_agent: true,
      parent_id: options.parentConversationId || undefined,
    },
    timeoutMs: 30_000,
  });
}

export async function runDoctorChecks(api) {
  const checks = [];

  const runCheck = async (name, task) => {
    const startedAt = Date.now();
    try {
      const result = await task();
      checks.push({
        name,
        status: result.ok ? 'pass' : 'warn',
        message: result.ok ? (result.message || 'OK') : (result.error || 'Failed'),
        duration: Date.now() - startedAt,
      });
    } catch (error) {
      checks.push({
        name,
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startedAt,
      });
    }
  };

  await runCheck('Daemon Reachable', async () => {
    const result = await daemonJson(api, getPluginConfig(api).readyPath, { quiet: true });
    return {
      ok: result.ok,
      message: result.ok ? 'Daemon is running and ready' : result.error,
    };
  });

  await runCheck('Health Status', async () => {
    const result = await daemonJson(api, getPluginConfig(api).healthPath, { quiet: true });
    return {
      ok: result.ok,
      message: result.ok ? 'Health check passed' : result.error,
    };
  });

  await runCheck('Extensions Loaded', async () => {
    const result = await daemonJson(api, '/api/catalog', { quiet: true });
    const count = Array.isArray(result.data) ? result.data.length : 0;
    return {
      ok: result.ok,
      message: result.ok ? `${count} extensions loaded` : result.error,
    };
  });

  await runCheck('Transport Connected', async () => {
    const result = await daemonJson(api, '/api/transport', { quiet: true });
    return {
      ok: result.ok,
      message: result.ok ? 'Transport layer connected' : result.error,
    };
  });

  await runCheck('Workers Available', async () => {
    const result = await daemonJson(api, '/api/workers', { quiet: true });
    const count = Array.isArray(result.data) ? result.data.length : 0;
    return {
      ok: result.ok,
      message: result.ok ? `${count} workers registered` : result.error,
    };
  });

  await runCheck('Schedules Active', async () => {
    const result = await daemonJson(api, '/api/schedules', { quiet: true });
    const count = Array.isArray(result.data) ? result.data.length : 0;
    return {
      ok: result.ok,
      message: result.ok ? `${count} schedules configured` : result.error,
    };
  });

  await runCheck('Audit Chain', async () => {
    const result = await daemonJson(api, '/api/audit/verify', { quiet: true });
    const valid = Boolean(result.data?.valid);
    return {
      ok: result.ok && valid,
      message: result.ok ? (valid ? 'Audit hash chain is valid' : 'Audit chain verification returned invalid') : result.error,
    };
  });

  replaceState(api, {
    doctorResults: checks,
    doctorCheckedAt: new Date().toISOString(),
  });

  return { ok: true, data: checks };
}

export async function knowledgeQuery(api, query, limit = 10) {
  if (!query) return { ok: false, error: 'A knowledge query is required.' };
  return daemonJson(api, '/api/apollo/query', {
    method: 'POST',
    body: {
      query,
      limit,
      agent_id: 'kai-legion-plugin',
    },
    timeoutMs: 30_000,
  });
}

export async function knowledgeBrowse(api, filters = {}) {
  const body = {
    query: cleanText(filters.tag || filters.source) || '*',
    limit: clampNumber(filters.per_page, 1, 200, 50),
    agent_id: 'kai-legion-plugin',
  };
  if (cleanText(filters.tag)) body.tags = [cleanText(filters.tag)];
  return daemonJson(api, '/api/apollo/query', {
    method: 'POST',
    body,
    timeoutMs: 30_000,
  });
}

export async function knowledgeDelete(api, id) {
  if (!id) return { ok: false, error: 'An entry id is required.' };
  return daemonJson(api, `/api/apollo/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function knowledgeIngestContent(api, content, metadata = {}) {
  if (!content) return { ok: false, error: 'Knowledge content is required.' };
  return daemonJson(api, '/api/apollo/ingest', {
    method: 'POST',
    body: {
      content,
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    },
    timeoutMs: 30_000,
  });
}

export async function knowledgeIngestFile(api, filePath) {
  if (!filePath) return { ok: false, error: 'A file path is required.' };
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  const binaryTypes = ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'zip', 'gz', 'tar', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
  if (binaryTypes.includes(extension)) {
    return { ok: false, error: `Binary file type .${extension} requires daemon-side extraction. Use the absorber pipeline for this file type.` };
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return daemonJson(api, '/api/apollo/ingest', {
      method: 'POST',
      body: {
        content,
        source_channel: 'desktop',
        source_agent: 'kai-legion-plugin',
        source_provider: filePath.split('/').pop() || filePath,
        tags: ['uploaded-file'],
      },
      timeoutMs: 30_000,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function knowledgeMonitorsList(api) {
  return daemonJson(api, '/api/extensions/knowledge/runners/monitors/list', {
    fallbackPath: '/api/lex/knowledge/monitors',
  });
}

export async function knowledgeMonitorAdd(api, path) {
  if (!path) return { ok: false, error: 'A monitor path is required.' };
  return daemonJson(api, '/api/extensions/knowledge/runners/monitors/create', {
    method: 'POST',
    body: { path },
    fallbackPath: '/api/lex/knowledge/monitors',
  });
}

export async function knowledgeMonitorRemove(api, id) {
  if (!id) return { ok: false, error: 'A monitor id is required.' };
  return daemonJson(api, `/api/extensions/knowledge/runners/monitors/delete?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    fallbackPath: `/api/lex/knowledge/monitors/${encodeURIComponent(id)}`,
  });
}

export async function knowledgeMonitorScan(api, id) {
  if (!id) return { ok: false, error: 'A monitor id is required.' };
  return daemonJson(api, `/api/extensions/knowledge/runners/monitors/scan?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    body: {},
    fallbackPath: `/api/lex/knowledge/monitors/${encodeURIComponent(id)}/scan`,
  });
}
