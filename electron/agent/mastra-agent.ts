/**
 * StreamEvent type definitions and re-exports.
 *
 * The Mastra standalone agent runtime has been removed.
 * All inference must go through the Legion daemon backend.
 */

export type { ReasoningEffort } from './model-catalog.js';

export type StreamEvent = {
  conversationId: string;
  type: 'text-delta' | 'observer-message' | 'tool-call' | 'tool-result' | 'tool-error' | 'tool-progress' | 'tool-compaction' | 'error' | 'done' | 'compaction' | 'context-usage' | 'model-fallback' | 'enrichment';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  data?: unknown;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  observerInitiated?: boolean;
  compaction?: {
    originalContent: string;
    wasCompacted: boolean;
    extractionDurationMs: number;
  };
};

import type { AppConfig } from '../config/schema.js';
import type { LLMModelConfig, ResolvedStreamConfig, ReasoningEffort } from './model-catalog.js';
import type { ToolDefinition } from '../tools/types.js';

export async function* streamAgentResponse(
  _conversationId: string,
  _messages: unknown[],
  _modelConfig: LLMModelConfig,
  _config: AppConfig,
  _tools: ToolDefinition[],
  _dbPath: string,
  _options?: {
    reasoningEffort?: ReasoningEffort;
    abortSignal?: AbortSignal;
    cwd?: string;
    emitEvent?: (event: StreamEvent) => void;
    onToolExecutionStart?: (state: { toolCallId: string; toolName: string; args: unknown; cancel: () => void }) => void;
    onToolExecutionEnd?: (state: { toolCallId: string; toolName: string }) => void;
    augmentToolResult?: (state: { toolCallId: string; toolName: string; args: unknown; result: unknown }) => Promise<unknown> | unknown;
  },
): AsyncGenerator<StreamEvent> {
  yield {
    conversationId: _conversationId,
    type: 'error',
    error: 'The standalone Mastra agent has been removed. Please start the Legion daemon.',
  };
  yield { conversationId: _conversationId, type: 'done' };
}

export async function* streamWithFallback(
  _conversationId: string,
  _messages: unknown[],
  _streamConfig: ResolvedStreamConfig,
  _config: AppConfig,
  _tools: ToolDefinition[],
  _dbPath: string,
  _options?: {
    reasoningEffort?: ReasoningEffort;
    abortSignal?: AbortSignal;
    cwd?: string;
    emitEvent?: (event: StreamEvent) => void;
    onToolExecutionStart?: (state: { toolCallId: string; toolName: string; args: unknown; cancel: () => void }) => void;
    onToolExecutionEnd?: (state: { toolCallId: string; toolName: string }) => void;
    augmentToolResult?: (state: { toolCallId: string; toolName: string; args: unknown; result: unknown }) => Promise<unknown> | unknown;
  },
): AsyncGenerator<StreamEvent> {
  yield {
    conversationId: _conversationId,
    type: 'error',
    error: 'The standalone Mastra agent has been removed. Please start the Legion daemon.',
  };
  yield { conversationId: _conversationId, type: 'done' };
}
