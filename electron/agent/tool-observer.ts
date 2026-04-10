/**
 * Tool observer stub.
 *
 * The standalone tool observer (secondary LLM monitoring tool execution)
 * has been removed. The Legion daemon handles tool monitoring natively.
 */

export type ToolObserverConfig = {
  enabled: boolean;
  intervalMs: number;
  maxSnapshotChars: number;
  maxMessagesPerTool: number;
  maxTotalLaunchedTools: number;
};

export type LaunchToolCallResult = {
  ok: boolean;
  launchedToolCallId?: string;
  details?: string;
};

export function resolveToolObserverConfig(_config: unknown): ToolObserverConfig {
  return {
    enabled: false,
    intervalMs: 5000,
    maxSnapshotChars: 4000,
    maxMessagesPerTool: 3,
    maxTotalLaunchedTools: 5,
  };
}

export function summarizeLatestUserRequest(_messages: unknown[]): string {
  return '';
}

export function summarizeThreadContext(_messages: unknown[]): string {
  return '';
}

export class ToolObserverManager {
  constructor(_options: unknown) {}
  onToolExecutionStart(_state: unknown): void {}
  onToolExecutionEnd(_toolCallId: string): void {}
  onToolExecutionResult(_toolCallId: string, _toolName: string, _result: unknown): void {}
  onToolProgress(_envelope: unknown): void {}
  getToolAugmentation(_toolCallId: string): undefined { return undefined; }
  async waitForLinkedLaunchedTools(_toolCallId: string): Promise<void> {}
  dispose(): void {}
}
