/**
 * Sub-agent runner stub.
 *
 * The standalone sub-agent system (Mastra child agents) has been removed.
 * Sub-agent functionality is handled by the Legion daemon.
 */

import type { StreamEvent } from './mastra-agent.js';

export type SubAgentEvent =
  | (StreamEvent & { subAgentConversationId: string; parentConversationId: string; parentToolCallId: string })
  | {
    subAgentConversationId: string;
    parentConversationId: string;
    parentToolCallId: string;
    type: 'sub-agent-status';
    status: 'running' | 'awaiting-input' | 'completed' | 'stopped' | 'failed';
    summary?: string;
    data?: unknown;
  }
  | {
    subAgentConversationId: string;
    parentConversationId: string;
    parentToolCallId: string;
    conversationId: string;
    type: 'sub-agent-user-message';
    text: string;
    source: string;
  };

export async function* runSubAgent(
  _options: unknown,
): AsyncGenerator<SubAgentEvent> {
  // no-op: sub-agents require the Mastra runtime which has been removed
}

export function getActiveSubAgentCount(): number {
  return 0;
}
