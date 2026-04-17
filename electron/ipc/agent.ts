import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { resolveModelForThread, resolveModelCatalog, resolveStreamConfig, type ModelCatalogEntry, type LLMModelConfig } from '../agent/model-catalog.js';
import type { StreamEvent, ReasoningEffort } from '../agent/mastra-agent.js';
import { getAppStatus, resolveAgentBackend, streamAppAgent } from '../agent/app-runtime.js';
import type { AppConfig } from '../config/schema.js';
import { readEffectiveConfig } from './config.js';
// Compaction removed — the daemon handles its own context management
import type { ToolDefinition } from '../tools/types.js';
import { ensureSafeToolDefinitions } from '../tools/naming.js';
import { sendSubAgentFollowUp, stopSubAgent, getActiveSubAgentIds } from '../tools/sub-agent.js';

const activeStreams = new Map<string, { abort: () => void }>();
const activeObserverSessions = new Map<string, string>();

function broadcastStreamEvent(event: StreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:stream-event', event);
  }
}

function mergeAbortSignals(primary?: AbortSignal, secondary?: AbortSignal): AbortSignal | undefined {
  if (!primary && !secondary) return undefined;
  if (!primary) return secondary;
  if (!secondary) return primary;

  const controller = new AbortController();
  if (primary.aborted || secondary.aborted) {
    controller.abort();
    return controller.signal;
  }

  const abort = (): void => controller.abort();
  primary.addEventListener('abort', abort, { once: true });
  secondary.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

function withWorkingDirectoryPrompt(basePrompt: string, cwd?: string): string {
  if (!cwd) return basePrompt;

  return [
    basePrompt,
    `Current working directory for this conversation: ${cwd}`,
    'Use this directory as the default base path for shell and filesystem work unless the user explicitly chooses another path.',
  ].filter(Boolean).join('\n\n');
}


// Tool registry - will be populated by Phase 4
let registeredTools: ToolDefinition[] = [];

export function registerTools(tools: ToolDefinition[]): void {
  registeredTools = ensureSafeToolDefinitions(tools);
}

export function getRegisteredTools(): ToolDefinition[] {
  return registeredTools;
}

/** Hot-swap MCP tools without touching built-in, skill, or plugin tools */
export function updateMcpTools(mcpTools: ToolDefinition[]): void {
  const nonMcp = registeredTools.filter((t) => t.source !== 'mcp');
  registeredTools = [...nonMcp, ...ensureSafeToolDefinitions(mcpTools)];
}

/** Hot-swap skill tools without touching built-in or MCP tools */
export function updateSkillTools(skillTools: ToolDefinition[]): void {
  const nonSkill = registeredTools.filter((t) => t.source !== 'skill');
  registeredTools = [...nonSkill, ...ensureSafeToolDefinitions(skillTools)];
}

/** Hot-swap plugin tools without touching built-in, MCP, or skill tools */
export function updatePluginTools(pluginTools: ToolDefinition[]): void {
  const nonPlugin = registeredTools.filter((t) => t.source !== 'plugin');
  registeredTools = [...nonPlugin, ...ensureSafeToolDefinitions(pluginTools)];
}

export function registerAgentHandlers(ipcMain: IpcMain, appHome: string): void {
  const dbPath = join(appHome, 'data', 'memory.db');

  ipcMain.handle(
    'agent:stream',
    async (
      _event,
      conversationId: string,
      messages: unknown[],
      modelKey?: string,
      reasoningEffort?: ReasoningEffort,
      profileKey?: string,
      fallbackEnabled?: boolean,
      cwd?: string,
    ) => {
    // Default working directory to user home if not set
    const effectiveCwd = cwd || homedir();

    // Cancel any existing stream for this conversation
    const existing = activeStreams.get(conversationId);
    if (existing) existing.abort();

    const controller = new AbortController();
    activeStreams.set(conversationId, { abort: () => controller.abort() });
    const randomBytes = new Uint8Array(4);
    crypto.getRandomValues(randomBytes);
    const observerSessionId = `${Date.now()}-${Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    activeObserverSessions.set(conversationId, observerSessionId);

    let config: AppConfig;
    try {
      config = readEffectiveConfig(appHome);
    } catch (error) {
      broadcastStreamEvent({
        conversationId,
        type: 'error',
        error: 'Failed to load config: ' + (error instanceof Error ? error.message : String(error)),
      });
      broadcastStreamEvent({ conversationId, type: 'done' });
      return { conversationId };
    }

    let streamConfig = resolveStreamConfig(config, {
      threadModelKey: modelKey ?? null,
      threadProfileKey: profileKey ?? null,
      reasoningEffort,
      fallbackEnabled: fallbackEnabled ?? false,
    });
    let modelEntry = streamConfig?.primaryModel ?? null;
    const backend = await resolveAgentBackend(config);
    const messageList = messages as Array<{ role?: string; content?: unknown }>;
    console.info(`[Agent:stream] conv=${conversationId} backend=${backend} model=${modelKey ?? config.models.defaultModelKey} profile=${profileKey ?? 'none'} fallback=${fallbackEnabled ? 'on' : 'off'} fallbackModels=${streamConfig?.fallbackModels.length ?? 0} messageCount=${messageList.length}`);
    for (const [index, message] of messageList.entries()) {
      const contentPreview = typeof message.content === 'string'
        ? message.content.slice(0, 200)
        : Array.isArray(message.content)
          ? JSON.stringify(message.content).slice(0, 200)
          : String(message.content ?? '').slice(0, 200);
      console.info(`[Agent:stream]   msg[${index}] role=${message.role ?? '?'} contentLen=${JSON.stringify(message.content ?? '').length} preview=${contentPreview}`);
    }

    if (!modelEntry || !streamConfig) {
      if (backend === 'legion-daemon') {
        // Daemon manages its own models — create a passthrough config so the request proceeds
        const fallbackModelConfig: LLMModelConfig = {
          provider: 'openai-compatible',
          endpoint: '',
          apiKey: '',
          modelName: '',
          temperature: config.advanced.temperature,
          maxSteps: config.advanced.maxSteps,
          maxRetries: config.advanced.maxRetries,
        };
        const fallbackEntry: ModelCatalogEntry = {
          key: '__daemon_default__',
          displayName: 'Daemon Default',
          modelConfig: fallbackModelConfig,
        };
        modelEntry = fallbackEntry;
        streamConfig = {
          primaryModel: fallbackEntry,
          fallbackModels: [],
          fallbackEnabled: false,
          systemPrompt: withWorkingDirectoryPrompt(config.systemPrompt, effectiveCwd),
          temperature: config.advanced.temperature,
          maxSteps: config.advanced.maxSteps,
          maxRetries: config.advanced.maxRetries,
          useResponsesApi: false,
        };
      } else {
        broadcastStreamEvent({
          conversationId,
          type: 'text-delta',
          text: 'No model configured. Please add a model provider in Settings and ensure your API key is set.',
        });
        broadcastStreamEvent({ conversationId, type: 'done' });
        return { conversationId };
      }
    }

    // Run streaming in background
    (async () => {
      if (backend !== 'mastra') {
        try {
          const daemonMessages = messages;

          if (controller.signal.aborted) {
            broadcastStreamEvent({ conversationId, type: 'done' });
            return;
          }

          // Serialize registered tools to JSON Schema for daemon inference
          const toolSchemas = registeredTools
            .filter((t) => typeof t.inputSchema?.safeParse === 'function')
            .map((t) => {
              try {
                // Use Zod's built-in JSON Schema output if available, otherwise
                // build a minimal schema from the Zod shape
                const shape = (t.inputSchema as { shape?: Record<string, unknown> }).shape;
                const properties: Record<string, unknown> = {};
                const required: string[] = [];
                if (shape && typeof shape === 'object') {
                  for (const [key, val] of Object.entries(shape)) {
                    const zodField = val as { _def?: { typeName?: string; description?: string }; isOptional?: () => boolean; description?: string };
                    properties[key] = { type: 'string', description: zodField.description ?? zodField._def?.description ?? '' };
                    if (typeof zodField.isOptional !== 'function' || !zodField.isOptional()) {
                      required.push(key);
                    }
                  }
                }
                return {
                  name: t.name,
                  description: t.description,
                  input_schema: { type: 'object' as const, properties, ...(required.length ? { required } : {}) },
                };
              } catch {
                return null;
              }
            })
            .filter(Boolean) as Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;

          console.info(`[Agent] Forwarding ${toolSchemas.length} tools to daemon:`, toolSchemas.map((t) => t.name));

          const stream = streamAppAgent({
            conversationId,
            messages: daemonMessages,
            modelConfig: modelEntry.modelConfig,
            config,
            appHome,
            abortSignal: controller.signal,
            reasoningEffort,
            tools: toolSchemas,
            cwd: effectiveCwd,
          });

          for await (const event of stream) {
            if (activeObserverSessions.get(conversationId) !== observerSessionId) continue;
            if (controller.signal.aborted && event.type !== 'done') continue;
            broadcastStreamEvent(event);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            broadcastStreamEvent({
              conversationId,
              type: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
            broadcastStreamEvent({ conversationId, type: 'done' });
          }
        } finally {
          activeStreams.delete(conversationId);
          if (activeObserverSessions.get(conversationId) === observerSessionId) {
            activeObserverSessions.delete(conversationId);
          }
        }
        return;
      }

      // Mastra standalone agent has been removed — daemon is required
      broadcastStreamEvent({
        conversationId,
        type: 'error',
        error: 'The Legion daemon is not running. Please start the daemon to use Legion Interlink.',
      });
      broadcastStreamEvent({ conversationId, type: 'done' });
    })();

      return { conversationId };
    },
  );

  ipcMain.handle('agent:cancel-stream', async (_event, conversationId: string) => {
    const controller = activeStreams.get(conversationId);
    if (controller) {
      controller.abort();
      activeStreams.delete(conversationId);
    }
    activeObserverSessions.delete(conversationId);
    return { ok: true };
  });

  ipcMain.handle('agent:app-status', async () => {
    try {
      const config = readEffectiveConfig(appHome);
      return await getAppStatus(config, appHome);
    } catch (error) {
      return {
        backend: 'mastra',
        daemon: {
          ok: false,
          status: 'request_failed',
          url: 'http://127.0.0.1:4567',
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  ipcMain.handle('agent:generate-title', async () => {
    // Title generation via direct LLM calls has been removed.
    // Titles should be generated by the Legion daemon if needed.
    return { title: null };
  });

  // Sub-agent interaction handlers
  ipcMain.handle('agent:sub-agent-message', async (_event, subAgentConversationId: string, message: string) => {
    const ok = sendSubAgentFollowUp(subAgentConversationId, message);
    return { ok, subAgentConversationId };
  });

  ipcMain.handle('agent:sub-agent-stop', async (_event, subAgentConversationId: string) => {
    const ok = stopSubAgent(subAgentConversationId);
    return { ok, subAgentConversationId };
  });

  ipcMain.handle('agent:sub-agent-list', async () => {
    return { ids: getActiveSubAgentIds() };
  });

  // Model catalog endpoint
  ipcMain.handle('agent:model-catalog', () => {
    try {
      const config = readEffectiveConfig(appHome);
      const catalog = resolveModelCatalog(config);
      return {
        models: catalog.entries.map((e: { key: string; displayName: string; modelConfig: { maxInputTokens?: number }; computerUseSupport?: string; visionCapable?: boolean; preferredTarget?: string }) => ({
          key: e.key,
          displayName: e.displayName,
          maxInputTokens: e.modelConfig.maxInputTokens,
          computerUseSupport: e.computerUseSupport,
          visionCapable: e.visionCapable,
          preferredTarget: e.preferredTarget,
        })),
        defaultKey: catalog.defaultEntry?.key ?? null,
      };
    } catch {
      return { models: [], defaultKey: null };
    }
  });

  // Profile catalog endpoint
  ipcMain.handle('agent:profiles', () => {
    try {
      const config = readEffectiveConfig(appHome);
      return {
        profiles: (config.profiles ?? []).map((p) => ({
          key: p.key,
          name: p.name,
          primaryModelKey: p.primaryModelKey,
          fallbackModelKeys: p.fallbackModelKeys,
        })),
        defaultKey: config.defaultProfileKey ?? null,
      };
    } catch {
      return { profiles: [], defaultKey: null };
    }
  });
}
