import { z } from 'zod';
import { generateObject } from 'ai';
import type {
  ComputerActionProposal,
  ComputerPlannerState,
  ComputerSession,
  ComputerUseRole,
} from '../../../shared/computer-use.js';
import { makeComputerUseId } from '../../../shared/computer-use.js';
import type { LLMModelConfig } from '../../agent/model-catalog.js';
import { createLanguageModelFromConfig } from '../../agent/language-model.js';

const plannerSchema = z.object({
  summary: z.string().min(1),
  subgoals: z.array(z.string().min(1)).min(1).max(6),
  successCriteria: z.array(z.string().min(1)).min(1).max(6),
});

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();
const nullableStringArray = z.array(z.string()).nullable();
const requiredMovementPath = z.enum(['direct', 'horizontal-first', 'vertical-first']).describe('Cursor travel strategy. For menus or any hover-sensitive UI, prefer horizontal-first or vertical-first instead of direct so pointer travel does not cross intermediate hover targets. Use direct only when a straight path is clearly safe or necessary.');

const actionSchema = z.object({
  complete: z.boolean(),
  summary: z.string().min(1).max(240),
  nextSubgoal: z.string().min(1).max(240).nullable(),
  actions: z.array(z.object({
    kind: z.enum(['navigate', 'movePointer', 'click', 'doubleClick', 'drag', 'scroll', 'typeText', 'pressKeys', 'wait', 'openApp', 'focusWindow']),
    rationale: z.string().min(1).max(240),
    risk: z.enum(['low', 'medium', 'high']),
    selector: nullableString,
    x: nullableNumber,
    y: nullableNumber,
    endX: nullableNumber,
    endY: nullableNumber,
    url: nullableString,
    text: nullableString,
    keys: nullableStringArray,
    deltaX: nullableNumber,
    deltaY: nullableNumber,
    appName: nullableString,
    waitMs: nullableNumber,
    movementPath: requiredMovementPath,
  })).max(3),
});

export type PlannedActions = {
  plannerState: ComputerPlannerState;
  summary: string;
  complete: boolean;
  currentSubgoal: string;
  actions: ComputerActionProposal[];
};

function toImageInput(frame: ComputerSession['latestFrame']): { image: Buffer | URL; mediaType?: string } | null {
  if (!frame) return null;

  if (frame.dataUrl.startsWith('data:')) {
    const match = frame.dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/);
    if (!match) {
      throw new Error('Computer-use frame data URL is not a valid base64 image payload.');
    }
    const [, mediaType, base64] = match;
    return {
      image: Buffer.from(base64, 'base64'),
      mediaType: mediaType ?? frame.mimeType,
    };
  }

  if (/^https?:\/\//i.test(frame.dataUrl)) {
    return {
      image: new URL(frame.dataUrl),
      mediaType: frame.mimeType,
    };
  }

  return {
    image: Buffer.from(frame.dataUrl, 'base64'),
    mediaType: frame.mimeType,
  };
}

function normalizeText(value?: string | null, maxLength = 120): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function actionFingerprint(action: Pick<ComputerActionProposal, 'kind' | 'selector' | 'x' | 'y' | 'endX' | 'endY' | 'url' | 'text' | 'keys' | 'deltaX' | 'deltaY' | 'appName' | 'waitMs' | 'movementPath'>): string {
  return JSON.stringify({
    kind: action.kind,
    selector: action.selector ?? null,
    x: action.x ?? null,
    y: action.y ?? null,
    endX: action.endX ?? null,
    endY: action.endY ?? null,
    url: action.url ?? null,
    text: normalizeText(action.text ?? null, 80) || null,
    keys: action.keys ?? null,
    deltaX: action.deltaX ?? null,
    deltaY: action.deltaY ?? null,
    appName: action.appName ?? null,
    waitMs: action.waitMs ?? null,
    movementPath: action.movementPath,
  });
}

function describeAction(action: Pick<ComputerActionProposal, 'kind' | 'selector' | 'x' | 'y' | 'endX' | 'endY' | 'url' | 'text' | 'keys' | 'deltaX' | 'deltaY' | 'appName' | 'waitMs' | 'movementPath'>): string {
  const parts: string[] = [action.kind];
  if (action.selector) parts.push(`selector=${action.selector}`);
  if (action.x != null && action.y != null) parts.push(`at ${action.x},${action.y}`);
  if (action.endX != null && action.endY != null) parts.push(`to ${action.endX},${action.endY}`);
  if (action.url) parts.push(`url=${action.url}`);
  if (action.text) parts.push(`text=${normalizeText(action.text, 60)}`);
  if (action.keys?.length) parts.push(`keys=${action.keys.join('+')}`);
  if (action.deltaX != null || action.deltaY != null) parts.push(`scroll=${action.deltaX ?? 0},${action.deltaY ?? 0}`);
  if (action.appName) parts.push(`app=${action.appName}`);
  if (action.waitMs != null) parts.push(`wait=${action.waitMs}ms`);
  if (action.kind === 'movePointer' || action.kind === 'click' || action.kind === 'doubleClick' || action.kind === 'drag') {
    parts.push(`path=${action.movementPath}`);
  }
  return parts.join(' · ');
}

function buildLoopAlert(session: ComputerSession): string | undefined {
  const candidates = session.actions
    .filter((action) => action.status === 'completed' || action.status === 'running' || action.status === 'failed')
    .slice(-8);
  if (candidates.length < 3) return undefined;

  const counts = new Map();
  let repeatedFingerprint: string | null = null;
  let repeatedAction: ComputerActionProposal | null = null;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const action = candidates[index];
    const fingerprint = actionFingerprint(action);
    const nextCount = (counts.get(fingerprint) ?? 0) + 1;
    counts.set(fingerprint, nextCount);
    if (nextCount >= 3) {
      repeatedFingerprint = fingerprint;
      repeatedAction = action;
      break;
    }
  }

  if (!repeatedFingerprint || !repeatedAction) return undefined;

  const sameActions = candidates.filter((action) => actionFingerprint(action) === repeatedFingerprint);
  if (sameActions.length < 3) return undefined;

  const failedCount = sameActions.filter((action) => action.status === 'failed').length;
  const latestResult = normalizeText(sameActions[sameActions.length - 1]?.resultSummary ?? sameActions[sameActions.length - 1]?.error ?? '', 160);
  const suffix = latestResult ? ` Latest outcome: ${latestResult}.` : '';
  return `Loop alert: the action \"${describeAction(repeatedAction)}\" was attempted ${sameActions.length} times recently${failedCount > 0 ? ` (${failedCount} failed)` : ''}. Do not propose that same action again unless the UI clearly changed and you explain why repeating it is now safe.${suffix}`;
}

async function createModel(modelConfig: LLMModelConfig): Promise<any> {
  return createLanguageModelFromConfig(modelConfig);
}

export async function createPlannerState(goal: string, modelConfig: LLMModelConfig, conversationContext?: string): Promise<ComputerPlannerState> {
  const model = await createModel(modelConfig);
  const prompt = [
    'You are planning a computer-use session. Create a short task graph for the goal below.',
    '',
    `Goal:\n${goal}`,
    conversationContext ? `Conversation context to resolve references like "that fix":\n${conversationContext}` : undefined,
    'Keep it concise and executable.',
  ].filter(Boolean).join('\n\n');
  const result = await generateObject({
    model,
    output: 'object',
    schema: plannerSchema,
    prompt,
  });
  return {
    summary: result.object.summary,
    subgoals: result.object.subgoals,
    successCriteria: result.object.successCriteria,
    activeSubgoalIndex: 0,
  };
}

export async function generateNextActions(params: {
  session: ComputerSession;
  modelConfig: LLMModelConfig;
  role: ComputerUseRole;
}): Promise<PlannedActions> {
  const { session, modelConfig, role } = params;
  const model = await createModel(modelConfig);
  const plannerState = session.plannerState ?? {
    summary: session.goal,
    subgoals: [session.goal],
    successCriteria: ['Task completed'],
    activeSubgoalIndex: 0,
  };
  const currentSubgoal = plannerState.subgoals[plannerState.activeSubgoalIndex] ?? plannerState.subgoals[0] ?? session.goal;
  const recentActions = session.actions.slice(-8).map((action) => {
    const path = action.kind === 'movePointer' || action.kind === 'click' || action.kind === 'doubleClick' || action.kind === 'drag'
      ? ` [path=${action.movementPath}]`
      : '';
    const suffix = action.resultSummary ? ` -> ${action.resultSummary}` : action.error ? ` -> ERROR: ${action.error}` : '';
    return `${action.kind}${path} (${action.status})${suffix}`;
  }).join('\n');
  const loopAlert = buildLoopAlert(session);
  const frame = session.latestFrame;
  const imageInput = toImageInput(frame);
  const metadata = session.latestEnvironment;
  // Build guidance message section from recent guidance (including newly injected ones)
  const guidanceMessages = (session.guidanceMessages ?? [])
    .filter((m) => m.text.trim())
    .slice(-10)
    .map((m) => {
      const time = new Date(m.createdAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${time}] "${m.text}"`;
    });
  const guidanceSection = guidanceMessages.length > 0
    ? `User guidance (received during this session — treat as highest-priority steering):\n${guidanceMessages.join('\n')}`
    : undefined;

  const promptParts = [
    `Role: ${role}`,
    `Overall goal: ${session.goal}`,
    session.conversationContext ? `Conversation context:\n${session.conversationContext}` : undefined,
    guidanceSection,
    `Plan summary: ${plannerState.summary}`,
    `Current subgoal: ${currentSubgoal}`,
    `Success criteria: ${plannerState.successCriteria.join(' | ')}`,
    metadata?.url ? `Current URL: ${metadata.url}` : undefined,
    metadata?.title ? `Current title: ${metadata.title}` : undefined,
    metadata?.appName ? `Current app: ${metadata.appName}` : undefined,
    metadata?.windowTitle ? `Current window: ${metadata.windowTitle}` : undefined,
    metadata?.visibleText ? `Visible text:\n${metadata.visibleText}` : undefined,
    recentActions ? `Recent actions:\n${recentActions}` : undefined,
    loopAlert,
    role === 'recovery'
      ? 'You are in recovery mode because the session appears stuck or repetitive. Diagnose why the prior approach failed, then choose a different next step. Prefer observation, focus changes, navigation changes, escape/back, or a short wait over repeating the same click.'
      : undefined,
    'Resolve references such as "that", "that fix", or "the change we discussed" against the conversation context before acting.',
    'Return the next 0-3 actions. Prefer navigate when a URL is obvious. Use click/scroll/type only when grounded in the current UI. Mark complete=true only when the user goal is clearly done.',
    'If the last approach appears stuck, do not repeat the same action sequence. Change strategy and gather new evidence from the current UI first.',
    'Always set movementPath to direct, horizontal-first, or vertical-first. For pointer-moving actions (movePointer, click, doubleClick, drag), choose the actual route you want the cursor to take.',
    'Menu interactions and any hover-sensitive UI should strongly avoid direct movement unless a straight path is the only safe option. Direct diagonal travel can cross intermediate items, open the wrong submenu, or collapse the intended target before the click lands.',
    'When working with menu bars, context menus, cascading submenus, popovers, hover cards, or toolbars that react to pointer travel, prefer horizontal-first or vertical-first and pick the axis order that stays inside the currently-open menu corridor.',
    'Use direct only when the path is clearly safe or necessary, such as a short unobstructed move, or when segmented motion would itself cross the wrong hover target. For non-pointer actions, use direct.',
    'The response schema is strict. Always include complete, summary, nextSubgoal, and every action field. Use null for any field that does not apply to a given action.',
  ].filter(Boolean).join('\n\n');

  const message = imageInput
    ? [{ role: 'user' as const, content: [{ type: 'text' as const, text: promptParts }, { type: 'image' as const, image: imageInput.image, mediaType: imageInput.mediaType }] }]
    : [{ role: 'user' as const, content: [{ type: 'text' as const, text: promptParts }] }];

  const result = await generateObject({
    model,
    output: 'object',
    schema: actionSchema,
    messages: message,
  });

  return {
    plannerState,
    summary: result.object.summary,
    complete: result.object.complete,
    currentSubgoal: result.object.nextSubgoal ?? currentSubgoal,
    actions: result.object.actions.map((action) => ({
      id: makeComputerUseId('action'),
      sessionId: session.id,
      createdAt: new Date().toISOString(),
      role,
      kind: action.kind,
      status: 'proposed',
      rationale: action.rationale,
      risk: action.risk,
      requiresApproval: action.risk !== 'low',
      selector: action.selector ?? undefined,
      x: action.x ?? undefined,
      y: action.y ?? undefined,
      endX: action.endX ?? undefined,
      endY: action.endY ?? undefined,
      url: action.url ?? undefined,
      text: action.text ?? undefined,
      keys: action.keys ?? undefined,
      deltaX: action.deltaX ?? undefined,
      deltaY: action.deltaY ?? undefined,
      appName: action.appName ?? undefined,
      waitMs: action.waitMs ?? undefined,
      movementPath: action.movementPath,
    })),
  };
}
