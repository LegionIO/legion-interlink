import type { z } from 'zod';

export type ToolProgressEvent = {
  stream: 'stdout' | 'stderr';
  delta: string;
  output: string;
  bytesSeen: number;
  truncated: boolean;
  stopped: boolean;
  subAgentConversationId?: string;
};

export type ToolExecutionContext = {
  toolCallId: string;
  abortSignal?: AbortSignal;
  onProgress?: (event: ToolProgressEvent) => void;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>;
};
