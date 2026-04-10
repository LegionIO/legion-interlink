/**
 * Compaction stub.
 *
 * Client-side compaction has been removed. The Legion daemon
 * handles its own context window management.
 */

export type ChatMessage = { role: string; content: unknown; id?: string };

export type ConversationCompactionConfig = {
  enabled: boolean;
  triggerPercent: number;
  summaryMaxTokens: number;
};

export type ToolCompactionConfig = {
  enabled: boolean;
  triggerTokens: number;
  summaryMaxTokens?: number;
  [key: string]: unknown;
};

export function shouldCompact(
  _messages: ChatMessage[],
  _modelName: string,
  _triggerPercent: number,
  _maxInputTokens?: number,
): { shouldCompact: false; usedTokens: 0; contextWindowTokens: 0 } {
  return { shouldCompact: false, usedTokens: 0, contextWindowTokens: 0 };
}

export async function compactConversationPrefix(
  _messages: ChatMessage[],
  _modelConfig: unknown,
  _config: ConversationCompactionConfig,
): Promise<{ compactedMessages: null; compactionId: null; summaryText: null; compactedMessageIds: null }> {
  return { compactedMessages: null, compactionId: null, summaryText: null, compactedMessageIds: null };
}

export async function compactToolResult(
  _originalText: string,
  _toolName: string,
  _userQuery: string,
  _config: ToolCompactionConfig,
  _modelConfig?: unknown,
  _modelName?: string,
): Promise<{ content: string; wasCompacted: false; extractionDurationMs: 0 }> {
  return { content: _originalText, wasCompacted: false, extractionDurationMs: 0 };
}

export function estimateToolTokens(_text: string, _modelName?: string): number {
  return 0;
}
