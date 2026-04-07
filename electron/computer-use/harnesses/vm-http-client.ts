import { setTimeout as sleep } from 'node:timers/promises';
import type {
  ComputerActionProposal,
  ComputerEnvironmentMetadata,
  ComputerUseCursorState,
} from '../../../shared/computer-use.js';
import { withBrandUserAgent } from '../../utils/user-agent.js';

/**
 * Remote VM protocol (HTTP polling variant):
 *
 * 1) Create session
 *    POST /v1/computer-use/sessions
 *    body: {
 *      clientSessionId: string,
 *      conversationId: string,
 *      goal: string,
 *      metadata?: Record<string, unknown>
 *    }
 *    response: { sessionId: string }
 *
 * 2) Capture/get state
 *    GET /v1/computer-use/sessions/{sessionId}/frame
 *      response: { frame: VmRemoteFrame } or VmRemoteFrame
 *    GET /v1/computer-use/sessions/{sessionId}/state
 *      response: { frame?: VmRemoteFrame, environment?: ComputerEnvironmentMetadata, cursor?: ... }
 *
 * 3) Execute action
 *    POST /v1/computer-use/sessions/{sessionId}/actions
 *    body: {
 *      action: {
 *        actionId: string,
 *        kind: ComputerActionProposal['kind'],
 *        params: { ... action params ... },
 *        requestedAt: string
 *      }
 *    }
 *    response (sync):
 *      { status: 'completed' | 'failed', result?: VmActionResult, error?: string }
 *    response (async):
 *      { status: 'accepted' | 'running', operationId: string, pollAfterMs?: number }
 *
 * 4) Poll operation (for async action responses)
 *    GET /v1/computer-use/operations/{operationId}
 *    response: { status: 'running' | 'completed' | 'failed', result?: VmActionResult, error?: string }
 *
 * 5) Dispose session
 *    DELETE /v1/computer-use/sessions/{sessionId}
 */

export type VmRemoteFrame = {
  mimeType?: string;
  dataUrl?: string;
  dataBase64?: string;
  url?: string;
  width?: number;
  height?: number;
  createdAt?: string;
  summary?: string;
  diffScore?: number;
};

export type VmStateSnapshot = {
  frame?: VmRemoteFrame;
  environment?: ComputerEnvironmentMetadata;
  cursor?: Partial<ComputerUseCursorState>;
};

export type VmActionResult = VmStateSnapshot & {
  summary?: string;
};

export type VmActionOutcome = VmActionResult & {
  error?: string;
};

type VmActionResponse = {
  status?: string;
  accepted?: boolean;
  operationId?: string;
  pollAfterMs?: number;
  result?: VmActionResult;
  error?: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  return typeof value === 'number' ? value : undefined;
}

function readBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const value = obj[key];
  return typeof value === 'boolean' ? value : undefined;
}

async function readResponseBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function ensureUrl(baseUrl: string, path: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const relative = path.startsWith('/') ? path.slice(1) : path;
  return new URL(relative, normalized).toString();
}

async function withAbortTimeout<T>(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason ?? new Error('Aborted'));
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export class VmHttpClient {
  constructor(private readonly baseUrl: string) {}

  async createSession(input: {
    clientSessionId: string;
    conversationId: string;
    goal: string;
    metadata?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<string> {
    const payload = {
      clientSessionId: input.clientSessionId,
      conversationId: input.conversationId,
      goal: input.goal,
      metadata: input.metadata,
    };
    const data = await this.requestJson('POST', '/v1/computer-use/sessions', payload, input.signal, 30000);
    const obj = toRecord(data);
    const sessionId = readString(obj, 'sessionId')
      ?? readString(toRecord(obj.data), 'sessionId')
      ?? readString(toRecord(obj.session), 'id')
      ?? readString(obj, 'id');

    if (!sessionId) {
      throw new Error(`Remote VM did not return a sessionId from ${this.baseUrl}`);
    }
    return sessionId;
  }

  async deleteSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    await this.requestJson('DELETE', `/v1/computer-use/sessions/${encodeURIComponent(sessionId)}`, undefined, signal, 20000);
  }

  async getState(sessionId: string, signal?: AbortSignal): Promise<VmStateSnapshot> {
    const data = await this.requestJson('GET', `/v1/computer-use/sessions/${encodeURIComponent(sessionId)}/state`, undefined, signal, 25000);
    return this.parseState(data);
  }

  async getFrame(sessionId: string, signal?: AbortSignal): Promise<VmRemoteFrame | null> {
    const data = await this.requestJson('GET', `/v1/computer-use/sessions/${encodeURIComponent(sessionId)}/frame`, undefined, signal, 25000);
    const obj = toRecord(data);
    const frame = toRecord(obj.frame ?? data);

    if (!readString(frame, 'dataUrl') && !readString(frame, 'dataBase64') && !readString(frame, 'url')) {
      return null;
    }

    return {
      mimeType: readString(frame, 'mimeType'),
      dataUrl: readString(frame, 'dataUrl'),
      dataBase64: readString(frame, 'dataBase64'),
      url: readString(frame, 'url'),
      width: readNumber(frame, 'width'),
      height: readNumber(frame, 'height'),
      createdAt: readString(frame, 'createdAt'),
      summary: readString(frame, 'summary'),
      diffScore: readNumber(frame, 'diffScore'),
    };
  }

  async performAction(sessionId: string, action: ComputerActionProposal, signal?: AbortSignal): Promise<VmActionOutcome> {
    const actionBody = {
      action: {
        actionId: action.id,
        kind: action.kind,
        params: {
          selector: action.selector,
          elementId: action.elementId,
          x: action.x,
          y: action.y,
          endX: action.endX,
          endY: action.endY,
          url: action.url,
          text: action.text,
          keys: action.keys,
          deltaX: action.deltaX,
          deltaY: action.deltaY,
          appName: action.appName,
          waitMs: action.waitMs,
          movementPath: action.movementPath,
        },
        requestedAt: action.createdAt,
      },
    };

    const data = await this.requestJson(
      'POST',
      `/v1/computer-use/sessions/${encodeURIComponent(sessionId)}/actions`,
      actionBody,
      signal,
      45000,
    );
    const response = this.parseActionResponse(data);

    if (response.error) {
      return { error: response.error };
    }

    if (response.result) {
      return response.result;
    }

    if (response.operationId) {
      return this.pollOperation(response.operationId, response.pollAfterMs ?? 400, signal);
    }

    if (response.accepted || response.status === 'accepted' || response.status === 'running') {
      const snapshot = await this.getState(sessionId, signal);
      return {
        summary: 'Action accepted by remote VM and current state refreshed.',
        frame: snapshot.frame,
        environment: snapshot.environment,
        cursor: snapshot.cursor,
      };
    }

    return {
      summary: 'Action executed on remote VM.',
    };
  }

  private async pollOperation(operationId: string, initialDelayMs: number, signal?: AbortSignal): Promise<VmActionOutcome> {
    const startedAt = Date.now();
    let delayMs = Math.max(150, Math.min(initialDelayMs, 5000));

    while (true) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('Remote VM action polling aborted');
      }

      if (Date.now() - startedAt > 120000) {
        throw new Error(`Timed out waiting for remote VM operation ${operationId}`);
      }

      await sleep(delayMs, undefined, { signal }).catch((error) => {
        if ((error as { name?: string }).name === 'AbortError') {
          throw error;
        }
        throw error;
      });

      const data = await this.requestJson(
        'GET',
        `/v1/computer-use/operations/${encodeURIComponent(operationId)}`,
        undefined,
        signal,
        30000,
      );
      const response = this.parseActionResponse(data);

      if (response.status === 'running' || response.status === 'accepted') {
        delayMs = Math.min(Math.max(response.pollAfterMs ?? delayMs, 150), 5000);
        continue;
      }

      if (response.error) {
        return { error: response.error };
      }

      if (response.result) {
        return response.result;
      }

      return {
        summary: 'Remote VM operation completed.',
      };
    }
  }

  private parseActionResponse(data: unknown): VmActionResponse {
    const obj = toRecord(data);
    const resultObj = toRecord(obj.result);

    const result: VmActionResult | undefined = Object.keys(resultObj).length > 0
      ? {
          summary: readString(resultObj, 'summary'),
          frame: this.parseFrameObject(resultObj.frame),
          environment: toRecord(resultObj.environment) as ComputerEnvironmentMetadata,
          cursor: toRecord(resultObj.cursor) as Partial<ComputerUseCursorState>,
        }
      : undefined;

    return {
      status: readString(obj, 'status'),
      accepted: readBoolean(obj, 'accepted'),
      operationId: readString(obj, 'operationId'),
      pollAfterMs: readNumber(obj, 'pollAfterMs'),
      result,
      error: readString(obj, 'error'),
    };
  }

  private parseState(data: unknown): VmStateSnapshot {
    const obj = toRecord(data);
    return {
      frame: this.parseFrameObject(obj.frame),
      environment: toRecord(obj.environment) as ComputerEnvironmentMetadata,
      cursor: toRecord(obj.cursor) as Partial<ComputerUseCursorState>,
    };
  }

  private parseFrameObject(value: unknown): VmRemoteFrame | undefined {
    const frame = toRecord(value);
    if (Object.keys(frame).length === 0) return undefined;
    return {
      mimeType: readString(frame, 'mimeType'),
      dataUrl: readString(frame, 'dataUrl'),
      dataBase64: readString(frame, 'dataBase64'),
      url: readString(frame, 'url'),
      width: readNumber(frame, 'width'),
      height: readNumber(frame, 'height'),
      createdAt: readString(frame, 'createdAt'),
      summary: readString(frame, 'summary'),
      diffScore: readNumber(frame, 'diffScore'),
    };
  }

  private async requestJson(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    timeoutMs = 25000,
  ): Promise<unknown> {
    const url = ensureUrl(this.baseUrl, path);

    return withAbortTimeout(timeoutMs, signal, async (combinedSignal) => {
      const response = await fetch(url, {
        method,
        headers: withBrandUserAgent({
          'content-type': 'application/json',
        }),
        body: body == null ? undefined : JSON.stringify(body),
        signal: combinedSignal,
      });

      if (!response.ok) {
        const bodyText = (await readResponseBody(response)).slice(0, 800);
        throw new Error(`Remote VM request failed (${response.status} ${response.statusText}) for ${url}: ${bodyText}`);
      }

      if (response.status === 204) {
        return {};
      }

      const text = await readResponseBody(response);
      if (!text) return {};

      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new Error(`Remote VM returned non-JSON payload for ${url}`);
      }
    });
  }
}
