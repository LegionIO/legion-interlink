import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { getAgentLatticeToken } from '../ipc/oauth.js';
import type { LegionConfig } from '../config/schema.js';
import { runToolExecution, throwIfAborted } from './execution.js';

type AgentLatticeToolInfo = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  agent?: string;
  isRemote?: boolean;
};

// Cache discovered tools
let discoveredTools: AgentLatticeToolInfo[] | null = null;
let lastDiscoveryAt = 0;
const DISCOVERY_CACHE_MS = 60_000; // re-discover every 60s

async function discoverAgentLatticeTools(agentUrl: string, token: string, signal?: AbortSignal): Promise<AgentLatticeToolInfo[]> {
  const now = Date.now();
  if (discoveredTools && now - lastDiscoveryAt < DISCOVERY_CACHE_MS) {
    return discoveredTools;
  }

  try {
    const response = await fetch(`${agentUrl.replace(/\/+$/, '')}/api/tools`, {
      signal,
      headers: {
        'X-User-Identity-Token': token,
      },
    });
    if (!response.ok) return discoveredTools ?? [];

    const data = await response.json() as { tools?: AgentLatticeToolInfo[] };
    discoveredTools = data.tools ?? [];
    lastDiscoveryAt = now;
    return discoveredTools;
  } catch {
    return discoveredTools ?? [];
  }
}

/**
 * Creates the agent_lattice_chat tool — delegates a task to the remote agent lattice
 * using natural language. The remote agent reasons and uses its own tools.
 */
export function createAgentLatticeChatTool(getConfig: () => LegionConfig): ToolDefinition {
  return {
    name: 'agent_lattice_chat',
    description: [
      'Delegate a task to Agent Lattice using natural language.',
      'The remote agent has access to specialized enterprise tools (deployments, repositories, pipelines, certificates, teams, etc).',
      'Use this when the user asks about infrastructure, deployments, applications, or anything that requires enterprise platform access.',
      'The remote agent will reason about the request and use its own tools to fulfill it.',
      'Requires OAuth authentication — the user must be signed in to Agent Lattice.',
    ].join(' '),
    inputSchema: z.object({
      message: z.string().describe('The task or question to send through Agent Lattice'),
      context: z.string().optional().describe('Additional context from the current conversation to help the remote agent'),
    }),
    execute: async (input, context) => runToolExecution({
      context,
      timeoutMs: 60000,
      run: async (signal) => {
        throwIfAborted(signal);
        const { message, context } = input as { message: string; context?: string };
        const config = getConfig();

        if (!config.agentLattice.enabled) {
          return { error: 'Agent Lattice is disabled. Enable it in Settings > Agent Lattice.', isError: true };
        }

        const token = getAgentLatticeToken();
        if (!token) {
          return { error: 'Not authenticated with Agent Lattice. Please authenticate via Settings > Agent Lattice.', isError: true };
        }

        const url = config.agentLattice.agentUrl;
        if (!url) {
          return { error: 'No Agent Lattice URL configured.', isError: true };
        }

        // Build messages with optional context
        const messages: Array<{ role: string; content: string }> = [];
        if (context) {
          messages.push({ role: 'user', content: `Context from current conversation:\n${context}` });
        }
        messages.push({ role: 'user', content: message });

        const response = await fetch(`${url.replace(/\/+$/, '')}/api/invoke`, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'X-User-Identity-Token': token,
          },
          body: JSON.stringify({
            input: {
              protocol_version: 'mesh/2.0',
              messages,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          return { error: `Agent Lattice request failed (${response.status}): ${errorText}`, isError: true };
        }

        const result = await response.json() as {
          output?: { messages?: Array<{ role: string; content: string }> };
          error?: { message?: string };
        };

        if (result.error) {
          return { error: result.error.message ?? 'Unknown error from Agent Lattice', isError: true };
        }

        const responseMessages = result.output?.messages ?? [];
        const assistantResponse = responseMessages
          .filter((m) => m.role === 'assistant')
          .map((m) => m.content)
          .join('\n\n');

        return {
          response: assistantResponse || 'No response from Agent Lattice',
          messageCount: responseMessages.length,
        };
      },
    }),
  };
}

/**
 * Creates the agent_lattice_discover tool — fetches available tools from Agent Lattice.
 * Useful for Legion to know what capabilities the lattice has before delegating.
 */
export function createAgentLatticeDiscoverTool(getConfig: () => LegionConfig): ToolDefinition {
  return {
    name: 'agent_lattice_discover',
    description: 'Discover what tools and capabilities Agent Lattice has. Use this to understand what tasks can be delegated before using agent_lattice_chat.',
    inputSchema: z.object({}),
    execute: async (_input, context) => runToolExecution({
      context,
      timeoutMs: 30000,
      run: async (signal) => {
        const config = getConfig();
        if (!config.agentLattice.enabled) {
          return { error: 'Agent Lattice is disabled.', isError: true };
        }

        const token = getAgentLatticeToken();
        if (!token) {
          return { error: 'Not authenticated with Agent Lattice.', isError: true };
        }

        const url = config.agentLattice.agentUrl;
        if (!url) {
          return { error: 'No Agent Lattice URL configured.', isError: true };
        }

        const tools = await discoverAgentLatticeTools(url, token, signal);
        return {
          agentUrl: url,
          toolCount: tools.length,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            agent: t.agent,
            isRemote: t.isRemote,
          })),
        };
      },
    }),
  };
}

/**
 * Creates the agent_lattice_info tool — fetches agent lattice metadata.
 */
export function createAgentLatticeInfoTool(getConfig: () => LegionConfig): ToolDefinition {
  return {
    name: 'agent_lattice_info',
    description: 'Get information about the Agent Lattice endpoint, including capabilities and connection status.',
    inputSchema: z.object({}),
    execute: async (_input, context) => runToolExecution({
      context,
      timeoutMs: 30000,
      run: async (signal) => {
        const config = getConfig();
        if (!config.agentLattice.enabled) {
          return { error: 'Agent Lattice is disabled.', isError: true };
        }

        const token = getAgentLatticeToken();
        if (!token) {
          return { error: 'Not authenticated with Agent Lattice.', isError: true };
        }

        const url = config.agentLattice.agentUrl;
        if (!url) {
          return { error: 'No Agent Lattice URL configured.', isError: true };
        }

        const response = await fetch(`${url.replace(/\/+$/, '')}/api/info`, {
          signal,
          headers: { 'X-User-Identity-Token': token },
        });
        if (!response.ok) {
          return { error: `Failed to fetch agent info (${response.status})`, isError: true };
        }
        return await response.json();
      },
    }),
  };
}
