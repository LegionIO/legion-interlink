export type ResponseTiming = {
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseTimestampMs(value?: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.floor(ms)}ms`;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}

export function buildResponseTiming(startedAt: string, finishedAt: string): ResponseTiming {
  const startedMs = parseTimestampMs(startedAt);
  const finishedMs = parseTimestampMs(finishedAt);

  return {
    startedAt,
    finishedAt,
    ...(startedMs != null && finishedMs != null
      ? { durationMs: Math.max(0, finishedMs - startedMs) }
      : {}),
  };
}

export function getResponseTiming(message: { metadata?: unknown } | null | undefined): ResponseTiming | null {
  if (!message || !isRecord(message.metadata)) return null;

  const custom = message.metadata['custom'];
  if (!isRecord(custom)) return null;

  const responseTiming = custom['responseTiming'];
  if (!isRecord(responseTiming)) return null;
  if (typeof responseTiming['startedAt'] !== 'string') return null;

  return {
    startedAt: responseTiming['startedAt'],
    ...(typeof responseTiming['finishedAt'] === 'string'
      ? { finishedAt: responseTiming['finishedAt'] }
      : {}),
    ...(typeof responseTiming['durationMs'] === 'number'
      ? { durationMs: responseTiming['durationMs'] }
      : {}),
  };
}

export function withResponseTiming<T extends { metadata?: unknown }>(message: T, responseTiming: ResponseTiming): T {
  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const custom = isRecord(metadata['custom']) ? metadata['custom'] : {};

  return {
    ...message,
    metadata: {
      ...metadata,
      custom: {
        ...custom,
        responseTiming,
      },
    },
  };
}
