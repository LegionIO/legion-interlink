/**
 * Event classification and proactive message detection.
 *
 * Extracts structured Notification objects from raw daemon SSE payloads and
 * detects proactive.* events that should be surfaced in the proactive thread.
 */

import type { Notification, ProactiveMessage } from './types';
import { SEVERITY_MAP } from './constants';
import { cleanText } from './utils';

/* -------------------------------------------------------------------------- */
/*  Event classification                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Classify a raw daemon event into a normalised `Notification`.
 *
 * Handles heterogeneous event shapes — the daemon may emit `type`, `event`,
 * `kind`, or the synthetic `__eventName` injected during SSE normalisation.
 * Severity is inferred from explicit hints first, then from type-name heuristics.
 */
export function classifyDaemonEvent(raw: unknown): Notification {
  const event: Record<string, unknown> =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const type =
    cleanText(event.type as string | undefined) ||
    cleanText(event.event as string | undefined) ||
    cleanText(event.kind as string | undefined) ||
    cleanText(event.__eventName as string | undefined) ||
    'event';

  const severityHint = (
    cleanText(event.severity as string | undefined) ||
    cleanText(event.level as string | undefined) ||
    cleanText(event.status as string | undefined)
  ).toLowerCase();

  const severity: string =
    SEVERITY_MAP[severityHint] ??
    (type.includes('error') || type.includes('fail')
      ? 'error'
      : type.includes('warn') || type.includes('degrad')
        ? 'warn'
        : type.includes('success') || type.includes('complet')
          ? 'success'
          : 'info');

  return {
    id:
      cleanText(event.id as string | undefined) ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity,
    title:
      cleanText(event.title as string | undefined) ||
      cleanText(event.summary as string | undefined) ||
      type.replace(/[._]/g, ' '),
    message:
      typeof event.message === 'string'
        ? event.message
        : typeof event.description === 'string'
          ? event.description
          : typeof event.details === 'string'
            ? event.details
            : typeof event.content === 'string'
              ? event.content
              : '',
    source:
      cleanText(event.source as string | undefined) ||
      cleanText(event.extension as string | undefined) ||
      cleanText(event.worker_id as string | undefined) ||
      '',
    timestamp:
      cleanText(event.timestamp as string | undefined) ||
      cleanText(event.created_at as string | undefined) ||
      new Date().toISOString(),
    read: false,
    raw,
  };
}

/* -------------------------------------------------------------------------- */
/*  Proactive message detection                                               */
/* -------------------------------------------------------------------------- */

/**
 * If the raw event is a `proactive.*` or `gaia.proactive` event, build a
 * `ProactiveMessage` payload suitable for the proactive conversation thread.
 * Returns `null` for all other event types.
 */
export function buildProactiveMessage(
  rawEvent: unknown,
  notification: Notification,
): ProactiveMessage | null {
  const event: Record<string, unknown> =
    rawEvent && typeof rawEvent === 'object'
      ? (rawEvent as Record<string, unknown>)
      : {};

  const eventType =
    cleanText(event.type as string | undefined) ||
    cleanText(event.event as string | undefined) ||
    cleanText(event.kind as string | undefined) ||
    cleanText(event.__eventName as string | undefined);

  if (!eventType.startsWith('proactive.') && eventType !== 'gaia.proactive') {
    return null;
  }

  const content =
    cleanText(event.content as string | undefined) ||
    cleanText(event.message as string | undefined) ||
    cleanText(event.text as string | undefined) ||
    notification.message ||
    notification.title;

  if (!content) return null;

  return {
    id: notification.id,
    intent: cleanText(event.intent as string | undefined) || eventType || 'insight',
    content,
    source: cleanText(event.source as string | undefined) || 'gaia',
    metadata:
      event.metadata && typeof event.metadata === 'object'
        ? (event.metadata as Record<string, unknown>)
        : {},
    timestamp: notification.timestamp,
  };
}

/* -------------------------------------------------------------------------- */
/*  Notification level mapping                                                */
/* -------------------------------------------------------------------------- */

/**
 * Map an internal severity string to the notification-level vocabulary
 * expected by the host `api.notifications.show()` call.
 *
 * The daemon uses `warn` while the host API expects `warning`.
 */
export function toNotificationLevel(severity: string): string {
  if (severity === 'warn') return 'warning';
  return severity;
}
