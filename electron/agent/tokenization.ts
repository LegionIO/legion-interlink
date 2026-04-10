/**
 * Tokenization stub.
 *
 * Client-side token counting has been removed along with the tiktoken dependency.
 */

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {};

export function countSerializedTokens(_text: string, _modelName?: string): number {
  return 0;
}

export function resolveConversationTokenization(_modelName: string): { contextWindow: number } {
  return { contextWindow: 128000 };
}

export function serializeForTokenCounting(_messages: unknown[]): string {
  return '';
}
