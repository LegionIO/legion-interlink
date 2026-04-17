/**
 * Trigger dispatch and workflow routing.
 *
 * When the daemon emits `trigger.*` events, they are triaged against the
 * user's configured rules, then routed to either a passive observation buffer
 * or an active sub-agent workflow.  Active workflows are tracked in-memory
 * via `workflowStore` and periodically refreshed from the daemon task API.
 */

import { randomUUID } from 'node:crypto';

import type {
  PluginAPI,
  PluginConfig,
  Workflow,
  TriggerEnvelope,
} from './types';
import type { DaemonResult } from './daemon-client';
import { getPluginConfig } from './config';
import { getWorkflowStore, replaceState } from './state';
import { daemonJson } from './daemon-client';
import { cleanText, matchesGlob, safeStringify } from './utils';

/** Convenience alias — returns the module-scoped Map from state.ts. */
const workflowStore = getWorkflowStore();

/* -------------------------------------------------------------------------- */
/*  Trigger entry point                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Inspect a raw daemon event.  If it is a `trigger.*` event and triggers
 * are enabled, triage it against the configured rules and dispatch it to
 * the appropriate handler (observe or act).
 */
export async function maybeHandleTriggerEvent(
  api: PluginAPI,
  rawEvent: unknown,
): Promise<void> {
  const event: Record<string, unknown> =
    rawEvent && typeof rawEvent === 'object'
      ? (rawEvent as Record<string, unknown>)
      : {};

  const type =
    cleanText(event.type as string | undefined) ||
    cleanText(event.event as string | undefined) ||
    cleanText(event.kind as string | undefined) ||
    cleanText(event.__eventName as string | undefined);

  if (!type.startsWith('trigger.')) return;

  const config = getPluginConfig(api);
  if (!config.triggersEnabled) return;

  const envelope: TriggerEnvelope = {
    type,
    source: cleanText(event.source as string | undefined) || 'unknown',
    eventType:
      cleanText(event.event_type as string | undefined) ||
      type.replace(/^trigger\./, ''),
    payload: (event.payload ?? event.data ?? {}) as Record<string, unknown>,
  };

  const action = triageEvent(envelope, config);
  if (action === 'ignore') return;

  // Enforce concurrency cap.
  const currentWorkflows = [...workflowStore.values()];
  const activeCount = currentWorkflows.filter(
    (wf) => wf.status === 'pending' || wf.status === 'running',
  ).length;

  if (activeCount >= config.maxConcurrentWorkflows) {
    return;
  }

  const workflow: Workflow = {
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

/* -------------------------------------------------------------------------- */
/*  Triage                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Match the trigger envelope against the user's `triggerRules` array.
 * The first matching rule wins.  Falls back to `config.autoTriage`
 * (observe) or ignore.
 */
export function triageEvent(
  envelope: TriggerEnvelope,
  config: PluginConfig,
): string {
  for (const rule of config.triggerRules) {
    if (!matchesGlob(cleanText(rule.source) || '*', envelope.source)) continue;
    if (!matchesGlob(cleanText(rule.eventType) || '*', envelope.eventType))
      continue;

    const filterPattern = cleanText(rule.filter);
    if (filterPattern) {
      try {
        const regex = new RegExp(filterPattern);
        const serializedPayload =
          typeof envelope.payload === 'string'
            ? envelope.payload
            : JSON.stringify(envelope.payload);
        if (!regex.test(serializedPayload)) continue;
      } catch {
        continue;
      }
    }

    return cleanText(rule.action) || 'observe';
  }

  return config.autoTriage ? 'observe' : 'ignore';
}

/* -------------------------------------------------------------------------- */
/*  Route: observe                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Post the trigger payload to the daemon's observation buffer.  The daemon
 * stores it for later analysis without spawning an active task.
 */
export async function routeObservedTrigger(
  api: PluginAPI,
  workflow: Workflow,
  envelope: TriggerEnvelope,
): Promise<void> {
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
    error: result.ok ? '' : result.error || 'Observation failed',
  });
}

/* -------------------------------------------------------------------------- */
/*  Route: act                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Compose a prompt describing the trigger and send it to the daemon's LLM
 * inference endpoint to spawn a sub-agent task.
 */
export async function routeActionTrigger(
  api: PluginAPI,
  workflow: Workflow,
  envelope: TriggerEnvelope,
): Promise<void> {
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

  const taskId = cleanText(
    (result.data as Record<string, unknown> | undefined)?.id as
      | string
      | undefined,
  ) ||
    cleanText(
      (result.data as Record<string, unknown> | undefined)?.task_id as
        | string
        | undefined,
    );

  updateWorkflow(api, workflow.id, {
    status: result.ok ? 'running' : 'failed',
    updatedAt: new Date().toISOString(),
    taskId,
    error: result.ok
      ? ''
      : result.error || 'Failed to create sub-agent workflow',
  });
}

/* -------------------------------------------------------------------------- */
/*  Workflow store helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Insert or replace a workflow in the in-memory store and push the full
 * list into plugin state.
 */
export function persistWorkflow(api: PluginAPI, workflow: Workflow): void {
  workflowStore.set(workflow.id, workflow);
  replaceState(api, {
    workflows: [...workflowStore.values()],
  }, {
    reason: 'workflow-updated',
    recordHistory: false,
  });
}

/**
 * Apply a partial patch to an existing workflow.  Returns the updated
 * workflow, or `null` if the ID was not found.
 */
export function updateWorkflow(
  api: PluginAPI,
  workflowId: string,
  patch: Partial<Workflow>,
): Workflow | null {
  const existing = workflowStore.get(workflowId);
  if (!existing) return null;

  const next: Workflow = {
    ...existing,
    ...patch,
  };

  workflowStore.set(workflowId, next);
  replaceState(api, {
    workflows: [...workflowStore.values()],
  }, {
    reason: 'workflow-updated',
    recordHistory: false,
  });

  return next;
}

/* -------------------------------------------------------------------------- */
/*  Workflow refresh (poll daemon task API)                                    */
/* -------------------------------------------------------------------------- */

/**
 * For every active workflow that has a `taskId`, poll the daemon task API
 * and update the local workflow status.
 *
 * @param options.quiet  When true, skip the final state publish when there
 *                       are no active workflows.
 */
export async function refreshWorkflowTasks(
  api: PluginAPI,
  options: { quiet?: boolean } = {},
): Promise<DaemonResult> {
  const activeWorkflows = [...workflowStore.values()].filter(
    (wf) =>
      wf.taskId &&
      ['pending', 'running', 'needs-input'].includes(wf.status),
  );

  if (activeWorkflows.length === 0) {
    if (!options.quiet) {
      replaceState(api, { workflows: [...workflowStore.values()] });
    }
    return { ok: true, data: [...workflowStore.values()] };
  }

  for (const workflow of activeWorkflows) {
    const taskResult = await daemonJson(
      api,
      `/api/tasks/${encodeURIComponent(workflow.taskId)}`,
      { quiet: true },
    );
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

/* -------------------------------------------------------------------------- */
/*  Task status normalisation                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Map a daemon task's raw status string into the normalised workflow status
 * vocabulary (`pending`, `running`, `needs-input`, `resolved`, `failed`).
 */
export function normalizeWorkflowStatus(taskData: unknown): {
  status: string;
  summary: string;
  error: string;
} {
  const raw = taskData && typeof taskData === 'object'
    ? (taskData as Record<string, unknown>)
    : {};

  const status = cleanText(raw.status as string | undefined).toLowerCase();

  if (
    ['needs_input', 'awaiting_input', 'awaiting-response'].includes(status)
  ) {
    return {
      status: 'needs-input',
      summary:
        cleanText(raw.message as string | undefined) ||
        cleanText(raw.summary as string | undefined) ||
        'Awaiting input',
      error: '',
    };
  }

  if (['completed', 'done', 'resolved'].includes(status)) {
    return {
      status: 'resolved',
      summary:
        cleanText(raw.summary as string | undefined) ||
        cleanText(raw.message as string | undefined) ||
        'Workflow resolved',
      error: '',
    };
  }

  if (['failed', 'error'].includes(status)) {
    return {
      status: 'failed',
      summary:
        cleanText(raw.summary as string | undefined) ||
        cleanText(raw.message as string | undefined) ||
        'Workflow failed',
      error:
        cleanText(raw.error as string | undefined) ||
        cleanText(raw.message as string | undefined),
    };
  }

  return {
    status: 'running',
    summary:
      cleanText(raw.summary as string | undefined) ||
      cleanText(raw.message as string | undefined) ||
      'Workflow running',
    error: '',
  };
}

/* -------------------------------------------------------------------------- */
/*  Workflow store hydration                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Re-populate the in-memory `workflowStore` from persisted plugin state.
 * Called once during activation to restore workflows across restarts.
 */
export function hydrateWorkflowStore(api: PluginAPI): void {
  workflowStore.clear();
  const state = api.state.get() || {};
  const workflows: unknown[] = Array.isArray(
    (state as Record<string, unknown>).workflows,
  )
    ? ((state as Record<string, unknown>).workflows as unknown[])
    : [];

  for (const wf of workflows) {
    if (
      wf &&
      typeof wf === 'object' &&
      typeof (wf as Record<string, unknown>).id === 'string'
    ) {
      workflowStore.set(
        (wf as Workflow).id,
        wf as Workflow,
      );
    }
  }
}
