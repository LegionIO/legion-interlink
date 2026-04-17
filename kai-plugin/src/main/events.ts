/**
 * SSE event stream management.
 *
 * Maintains a persistent connection to the daemon's server-sent event
 * endpoint.  Events are parsed, normalised, classified, and dispatched to
 * the state store, the proactive conversation thread, the workflow engine,
 * and the host notification system.
 */

import type { PluginAPI, Notification, ProactiveMessage } from './types';
import { getPluginConfig } from './config';
import { getCurrentState, replaceState, updateState, mergeNotifications } from './state';
import { fetchWithTimeout, buildDaemonHeaders } from './daemon-client';
import { classifyDaemonEvent, buildProactiveMessage, toNotificationLevel } from './events-classify';
import { appendProactiveMessage } from './conversations';
import { maybeHandleTriggerEvent } from './workflows';
import { clampNumber, joinUrl } from './utils';
import {
  TOAST_TYPES,
  PROACTIVE_THREAD_ID,
  DEFAULT_TIMEOUT_MS,
  EVENT_RECONNECT_MIN_MS,
  EVENT_RECONNECT_MAX_MS,
  DEFAULTS,
} from './constants';

/* -------------------------------------------------------------------------- */
/*  Module-scoped state                                                       */
/* -------------------------------------------------------------------------- */

let eventsController: AbortController | null = null;
let eventsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Tear down the event stream — abort any in-flight connection and cancel
 * any pending reconnect timer.
 */
export function stopEventStream(): void {
  if (eventsReconnectTimer) {
    clearTimeout(eventsReconnectTimer);
    eventsReconnectTimer = null;
  }
  if (eventsController) {
    eventsController.abort();
    eventsController = null;
  }
}

/**
 * Ensure the SSE event stream is running when conditions are met.
 *
 * Conditions: plugin enabled, autoConnectEvents on, daemon URL configured,
 * and the runtime status is not `disabled` or `unconfigured`.
 *
 * If conditions are *not* met the stream is torn down.  If it is already
 * running (or a reconnect is scheduled) this is a no-op.
 */
export function ensureEventStream(api: PluginAPI): void {
  const config = getPluginConfig(api);
  const state = getCurrentState(api);

  const shouldConnect = Boolean(
    config.enabled &&
      config.autoConnectEvents &&
      config.daemonUrl &&
      state.status !== 'disabled' &&
      state.status !== 'unconfigured',
  );

  if (!shouldConnect) {
    stopEventStream();
    replaceState(api, { eventsConnected: false });
    return;
  }

  // Already connected or reconnect pending — nothing to do.
  if (eventsController || eventsReconnectTimer) return;

  const controller = new AbortController();
  eventsController = controller;
  void connectEventStream(api, controller);
}

/* -------------------------------------------------------------------------- */
/*  Connection lifecycle                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Open the SSE connection to the daemon, consume the stream, and handle
 * errors with automatic reconnection.
 */
export async function connectEventStream(
  api: PluginAPI,
  controller: AbortController,
): Promise<void> {
  const config = getPluginConfig(api);
  const url = joinUrl(config.daemonUrl, config.eventsPath);

  try {
    const response = await fetchWithTimeout(
      api,
      url,
      {
        method: 'GET',
        headers: buildDaemonHeaders(config, { accept: 'text/event-stream' }),
        signal: controller.signal,
      },
      DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    replaceState(api, {
      eventsConnected: true,
      eventsConnectedAt: new Date().toISOString(),
      eventsLastError: null,
    });

    await consumeServerSentEvents(api, response.body, controller.signal);

    // If the stream ended without the controller being aborted it means the
    // server closed the connection — treat it as an error to trigger reconnect.
    if (!controller.signal.aborted) {
      throw new Error('Event stream ended.');
    }
  } catch (error: unknown) {
    if (controller.signal.aborted) return;

    const message = error instanceof Error ? error.message : String(error);
    replaceState(api, {
      eventsConnected: false,
      eventsLastError: message,
      eventsLastDisconnectedAt: new Date().toISOString(),
    });
    scheduleEventReconnect(api);
  } finally {
    if (eventsController === controller) {
      eventsController = null;
    }
  }
}

/**
 * Schedule a single reconnect attempt after the configured (or default) delay.
 */
export function scheduleEventReconnect(api: PluginAPI): void {
  if (eventsReconnectTimer) return;

  const delay = clampNumber(
    getPluginConfig(api).sseReconnectMs,
    EVENT_RECONNECT_MIN_MS,
    EVENT_RECONNECT_MAX_MS,
    DEFAULTS.sseReconnectMs,
  );

  eventsReconnectTimer = setTimeout(() => {
    eventsReconnectTimer = null;
    ensureEventStream(api);
  }, delay);
}

/* -------------------------------------------------------------------------- */
/*  SSE parser                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Consume a `ReadableStream<Uint8Array>` as a server-sent event stream,
 * dispatching each complete event to `onDaemonEvent`.
 */
export async function consumeServerSentEvents(
  api: PluginAPI,
  body: ReadableStream<Uint8Array>,
  abortSignal: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];

  const flush = async (): Promise<void> => {
    const rawData = dataLines.join('\n').trim();
    const explicitEventName = eventName;
    eventName = '';
    dataLines = [];

    if (!rawData || rawData === '[DONE]') return;

    let payload: unknown = rawData;
    try {
      payload = JSON.parse(rawData);
    } catch {
      // Plain-text SSE payloads are valid.
    }

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
        if (trimmed.startsWith(':')) continue; // SSE comment
        if (trimmed.startsWith('event:')) {
          eventName = trimmed.slice(6).trim();
          continue;
        }
        if (trimmed.startsWith('data:')) {
          dataLines.push(trimmed.slice(5).trimStart());
        }
      }
    }

    // Handle any trailing data left in the buffer after EOF.
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
      replaceState(api, {
        eventsConnected: false,
        eventsLastDisconnectedAt: new Date().toISOString(),
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Payload normalisation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The daemon may emit individual objects, arrays, or a wrapper
 * `{ events: [...] }`.  This normalises all shapes into a flat array
 * of event objects, injecting `__eventName` when the SSE `event:` field
 * was set explicitly.
 */
export function normalizeDaemonSsePayload(
  eventName: string,
  payload: unknown,
): unknown[] {
  if (Array.isArray(payload)) return payload;

  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as Record<string, unknown>).events)
  ) {
    return (payload as Record<string, unknown>).events as unknown[];
  }

  if (payload && typeof payload === 'object') {
    return [
      {
        ...(eventName ? { __eventName: eventName } : {}),
        ...(payload as Record<string, unknown>),
      },
    ];
  }

  return [{ type: eventName || 'event', message: String(payload) }];
}

/* -------------------------------------------------------------------------- */
/*  Per-event dispatch                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Process a single daemon event:
 *
 * 1. Classify into a `Notification`.
 * 2. Merge into state (notifications list, event-stream bookkeeping).
 * 3. If the event is proactive, append it to the proactive conversation.
 * 4. Route through the trigger/workflow engine.
 * 5. Fire a host notification toast when appropriate.
 * 6. Emit a `daemon-event` state event for renderer listeners.
 */
export async function onDaemonEvent(
  api: PluginAPI,
  rawEvent: unknown,
): Promise<void> {
  const notification: Notification = classifyDaemonEvent(rawEvent);

  updateState(
    api,
    (previous) => ({
      ...previous,
      notifications: mergeNotifications(previous.notifications, [notification]),
      eventsConnected: true,
      eventsLastEventAt: notification.timestamp,
    }),
    {
      reason: 'daemon-event',
      recordHistory: false,
    },
  );

  const proactiveMessage: ProactiveMessage | null = buildProactiveMessage(
    rawEvent,
    notification,
  );
  if (proactiveMessage) {
    await appendProactiveMessage(api, proactiveMessage);
  }

  await maybeHandleTriggerEvent(api, rawEvent);

  const config = getPluginConfig(api);
  if (
    config.notificationsEnabled &&
    (notification.severity === 'error' || TOAST_TYPES.has(notification.type))
  ) {
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
