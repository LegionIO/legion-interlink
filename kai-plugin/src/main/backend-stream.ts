import type { PluginAPI } from './types.js';
import { getPluginConfig } from './config.js';
import { daemonJson, fetchWithTimeout, buildDaemonHeaders, parseResponseBody, extractErrorMessage } from './daemon-client.js';
import { cleanText, sleep, stringifyValue, toIsoTimestamp, numberOrUndefined, joinUrl } from './utils.js';

/* ── Zod-to-JSON-Schema lazy loader ── */

let zodToJsonSchemaModule: ((schema: unknown, options?: unknown) => unknown) | null = null;
let zodToJsonSchemaPromise: Promise<((schema: unknown, options?: unknown) => unknown) | null> | null = null;

async function loadZodToJsonSchema(): Promise<((schema: unknown, options?: unknown) => unknown) | null> {
  if (zodToJsonSchemaModule) return zodToJsonSchemaModule;
  if (zodToJsonSchemaPromise) return zodToJsonSchemaPromise;

  zodToJsonSchemaPromise = import(/* @vite-ignore */ 'zod-to-json-schema' as string)
    .then((module: Record<string, unknown>) => {
      const converter = (module.default || module) as (schema: unknown, options?: unknown) => unknown;
      zodToJsonSchemaModule = converter;
      return zodToJsonSchemaModule;
    })
    .catch(() => null)
    .finally(() => {
      zodToJsonSchemaPromise = null;
    });

  return zodToJsonSchemaPromise;
}

export async function zodSchemaToJson(schema: unknown): Promise<unknown> {
  if (!schema || typeof schema !== 'object') return {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaObj = schema as any;

  if (typeof schemaObj.safeParse === 'function') {
    // Try Zod v4 built-in z.toJSONSchema() first
    try {
      const zod: Record<string, unknown> = await import(/* @vite-ignore */ 'zod' as string);
      if (typeof (zod as Record<string, unknown>).toJSONSchema === 'function') {
        return (zod as Record<string, unknown> & { toJSONSchema: (s: unknown) => unknown }).toJSONSchema(schemaObj);
      }
    } catch {
      // Zod v4 built-in not available, fall through.
    }

    // Fall back to zod-to-json-schema
    try {
      const converter = await loadZodToJsonSchema();
      if (typeof converter !== 'function') return {};
      return converter(schemaObj, {
        $refStrategy: 'none',
        target: 'jsonSchema7',
      });
    } catch {
      return {};
    }
  }

  return schema;
}

/* ── Message normalization ── */

export function normalizeMessages(
  messages: unknown[],
): Array<{ role: string; content: unknown[] }> {
  const items = Array.isArray(messages) ? messages : [];
  return items
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const msg = message as Record<string, unknown>;
      const role = msg.role === 'assistant' ? 'assistant' : msg.role === 'user' ? 'user' : '';
      if (!role) return null;
      const text = extractMessageText(msg.content);
      if (!text) return null;
      return { role, content: [{ type: 'text', text }] };
    })
    .filter(Boolean) as Array<{ role: string; content: unknown[] }>;
}

export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const p = part as Record<string, unknown>;
      switch (p.type) {
        case 'text':
          return (p.text as string) || '';
        case 'image':
          return '[Image]';
        case 'file':
          return p.filename ? `[File: ${p.filename}]` : '[File]';
        case 'tool-call': {
          const lines = [`[Tool call: ${(p.toolName as string) || 'unknown'}]`];
          if (p.args !== undefined) lines.push(`Args: ${stringifyValue(p.args, 1_000)}`);
          if (p.result !== undefined) lines.push(`Result: ${stringifyValue(p.result, 1_500)}`);
          return lines.join('\n');
        }
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

/* ── SSE consumer for daemon inference ── */

export async function* consumeDaemonInferenceSse(
  conversationId: string,
  body: ReadableStream,
  abortSignal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedAny = false;
  let currentEventName = '';
  let currentDataLines: string[] = [];

  const flush = async (): Promise<Array<Record<string, unknown>>> => {
    if (!currentEventName && currentDataLines.length === 0) return [];
    const rawData = currentDataLines.join('\n').trim();
    const explicitEventName = currentEventName;
    currentEventName = '';
    currentDataLines = [];
    if (!rawData || rawData === '[DONE]') return [];

    let payload: unknown;
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

/* ── Inference event normalization ── */

export function normalizeInferenceEvent(
  eventName: string,
  payload: unknown,
  conversationId: string,
): Array<Record<string, unknown>> {
  const normalizedName = normalizeDaemonEventName(eventName, payload);
  if (!normalizedName) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (payload && typeof payload === 'object' ? payload : {}) as any;

  if (['text-delta', 'text_delta', 'delta'].includes(normalizedName)) {
    const text = p.text || p.delta || '';
    return text ? [{ conversationId, type: 'text-delta', text }] : [];
  }

  if (['tool-call', 'tool_call'].includes(normalizedName)) {
    return [{
      conversationId,
      type: 'tool-call',
      toolCallId: p.toolCallId || p.tool_call_id,
      toolName: p.toolName || p.tool_name,
      args: p.args || p.parameters || {},
      startedAt: toIsoTimestamp(p.startedAt || p.started_at || p.timestamp) || new Date().toISOString(),
      messageMeta: extractMessageMeta(p),
    }];
  }

  if (['tool-result', 'tool_result'].includes(normalizedName)) {
    return [{
      conversationId,
      type: 'tool-result',
      toolCallId: p.toolCallId || p.tool_call_id,
      toolName: p.toolName || p.tool_name,
      result: p.result ?? p.content,
      startedAt: toIsoTimestamp(p.startedAt || p.started_at) || undefined,
      finishedAt: toIsoTimestamp(p.finishedAt || p.finished_at || p.timestamp) || new Date().toISOString(),
      durationMs: numberOrUndefined(p.durationMs ?? p.duration_ms),
      messageMeta: extractMessageMeta(p),
    }];
  }

  if (['tool-error', 'tool_error'].includes(normalizedName)) {
    return [{
      conversationId,
      type: 'tool-result',
      toolCallId: p.toolCallId || p.tool_call_id,
      toolName: p.toolName || p.tool_name,
      result: { isError: true, error: p.error || p.message || 'Tool execution failed' },
      startedAt: toIsoTimestamp(p.startedAt || p.started_at) || undefined,
      finishedAt: toIsoTimestamp(p.finishedAt || p.finished_at || p.timestamp) || new Date().toISOString(),
      messageMeta: extractMessageMeta(p),
    }];
  }

  if (['tool-progress', 'tool_progress'].includes(normalizedName)) {
    return [{
      conversationId,
      type: 'tool-progress',
      toolCallId: p.toolCallId || p.tool_call_id,
      toolName: p.toolName || p.tool_name,
      data: p,
      messageMeta: extractMessageMeta(p),
    }];
  }

  if (normalizedName === 'error') {
    return [{
      conversationId,
      type: 'error',
      error: p.error || p.message || 'Daemon stream error',
    }];
  }

  if (['enrichment', 'enrichments'].includes(normalizedName)) {
    return [{ conversationId, type: 'enrichment', data: p }];
  }

  if (normalizedName === 'done') {
    const events: Array<Record<string, unknown>> = [];
    const enrichments = p.enrichments || p.pipeline_enrichments;
    if (enrichments && typeof enrichments === 'object' && !Array.isArray(enrichments)) {
      events.push({ conversationId, type: 'enrichment', data: enrichments });
    }
    const inputTokens = numberOrUndefined(p.input_tokens ?? p.inputTokens);
    const outputTokens = numberOrUndefined(p.output_tokens ?? p.outputTokens);
    const cacheReadTokens = numberOrUndefined(p.cache_read_tokens ?? p.cacheReadTokens);
    const cacheWriteTokens = numberOrUndefined(p.cache_write_tokens ?? p.cacheWriteTokens);
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
    events.push({ conversationId, type: 'done', data: p });
    return events;
  }

  if (['context_usage', 'context-usage'].includes(normalizedName)) {
    return [{ conversationId, type: 'context-usage', data: p }];
  }

  if (['model-fallback', 'model_fallback'].includes(normalizedName)) {
    return [{ conversationId, type: 'model-fallback', data: p }];
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
    return [{ conversationId, type: 'compaction', data: { event: normalizedName, ...p } }];
  }

  if (typeof p.response === 'string') {
    return [{
      conversationId,
      type: 'text-delta',
      text: p.response,
      messageMeta: extractMessageMeta(p),
    }];
  }

  return [];
}

export function normalizeDaemonEventName(eventName: string, payload: unknown): string {
  if (cleanText(eventName)) return cleanText(eventName);
  const p = payload as Record<string, unknown> | null;
  return cleanText((p?.type as string) ?? '');
}

export function extractMessageMeta(payload: unknown): Record<string, unknown> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as any;
  const messageMeta: Record<string, unknown> = {};
  if (p.parent_id != null) messageMeta.parentId = p.parent_id;
  if (p.sidechain != null) messageMeta.sidechain = p.sidechain;
  if (p.message_group_id != null) messageMeta.messageGroupId = p.message_group_id;
  if (p.agent_id != null) messageMeta.agentId = p.agent_id;
  return Object.keys(messageMeta).length > 0 ? messageMeta : undefined;
}

/* ── Sync response handler ── */

export async function* handleDaemonSyncResponse(
  api: PluginAPI,
  conversationId: string,
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const body = await parseResponseBody(response);

  if (response.status === 202) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = body as any;
    const taskId = cleanText(b?.task_id || b?.data?.task_id || b?.id);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = body as any;
  const text: string = typeof b?.data?.content === 'string'
    ? b.data.content
    : typeof b?.data?.response === 'string'
      ? b.data.response
      : typeof b?.response === 'string'
        ? b.response
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

/* ── Task polling ── */

export async function* pollDaemonTask(
  api: PluginAPI,
  conversationId: string,
  taskId: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = response.data as any;
    const status = cleanText(data?.status).toLowerCase();
    if (['completed', 'done', 'resolved'].includes(status)) {
      const responseText = data?.result?.response;
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
        error: data?.error || `Legion daemon task ${taskId} failed.`,
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

/* ── Main streaming entrypoint ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function* streamFromDaemon(api: PluginAPI, options: any): AsyncGenerator<any> {
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

  const requestBody: Record<string, unknown> = {
    messages: normalizedMessages,
    ...(options.tools?.length ? {
      tools: await Promise.all(
        (options.tools as Array<{ name: string; description: string; inputSchema: unknown }>).map(
          async (tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: await zodSchemaToJson(tool.inputSchema),
          }),
        ),
      ),
    } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.conversationId ? { conversation_id: options.conversationId } : {}),
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    rag_enabled: config.knowledgeRagEnabled,
    capture_enabled: config.knowledgeCaptureEnabled,
    knowledge_scope: config.knowledgeScope,
  };

  if (config.daemonStreaming !== false) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        api,
        joinUrl(config.daemonUrl, config.streamPath),
        {
          method: 'POST',
          headers: buildDaemonHeaders(config, {
            accept: 'text/event-stream',
            'content-type': 'application/json',
          }),
          body: JSON.stringify({ ...requestBody, stream: true }),
          signal: options.abortSignal,
        },
        60_000,
      );
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

  const response = await fetchWithTimeout(
    api,
    joinUrl(config.daemonUrl, config.streamPath),
    {
      method: 'POST',
      headers: buildDaemonHeaders(config, {
        'content-type': 'application/json',
        'x-kai-sync': 'true',
      }),
      body: JSON.stringify(requestBody),
      signal: options.abortSignal,
    },
    60_000,
  );

  yield* handleDaemonSyncResponse(api, options.conversationId, response, options.abortSignal);
}
