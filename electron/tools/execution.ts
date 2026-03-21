import type { ToolExecutionContext } from './types.js';

export type ToolErrorResult = {
  error: string;
  isError: true;
  cancelled?: boolean;
  timedOut?: boolean;
};

export type RunToolExecutionOptions<T> = {
  context: ToolExecutionContext;
  timeoutMs?: number;
  run: (signal: AbortSignal) => Promise<T>;
};

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof Error) return error.name === 'AbortError';
  if (typeof error === 'object' && error !== null) {
    return (error as { name?: string }).name === 'AbortError';
  }
  return false;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const err = new Error('Tool execution cancelled.');
    err.name = 'AbortError';
    throw err;
  }
}

export async function runToolExecution<T>(
  options: RunToolExecutionOptions<T>,
): Promise<T | ToolErrorResult> {
  const { context, timeoutMs, run } = options;
  const controller = new AbortController();
  let timedOut = false;

  const onParentAbort = (): void => {
    controller.abort(new Error('cancelled'));
  };

  if (context.abortSignal) {
    if (context.abortSignal.aborted) {
      return { error: 'Tool execution cancelled.', isError: true, cancelled: true };
    }
    context.abortSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const timeoutId = timeoutMs && timeoutMs > 0
    ? setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('timed out'));
    }, timeoutMs)
    : null;

  const abortPromise: Promise<{ kind: 'aborted' }> = controller.signal.aborted
    ? Promise.resolve({ kind: 'aborted' as const })
    : new Promise((resolve) => {
      controller.signal.addEventListener('abort', () => resolve({ kind: 'aborted' as const }), { once: true });
    });

  const runPromise = Promise.resolve()
    .then(() => run(controller.signal))
    .then((value) => ({ kind: 'value' as const, value }))
    .catch((error) => ({ kind: 'error' as const, error }));

  try {
    const raced = await Promise.race([runPromise, abortPromise]);
    if (raced.kind === 'aborted') {
      if (timedOut) {
        return { error: 'Tool execution timed out.', isError: true, timedOut: true };
      }
      return { error: 'Tool execution cancelled.', isError: true, cancelled: true };
    }
    if (raced.kind === 'error') {
      if (timedOut) {
        return { error: 'Tool execution timed out.', isError: true, timedOut: true };
      }
      if (controller.signal.aborted || isAbortLikeError(raced.error)) {
        return { error: 'Tool execution cancelled.', isError: true, cancelled: true };
      }
      return { error: normalizeErrorMessage(raced.error), isError: true };
    }
    return raced.value;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (context.abortSignal) {
      context.abortSignal.removeEventListener('abort', onParentAbort);
    }
  }
}
