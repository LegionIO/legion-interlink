import { z } from 'zod';

const providerSchema = z.object({
  type: z.enum(['openai-compatible', 'anthropic', 'amazon-bedrock', 'google']),
  enabled: z.boolean().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  apiVersion: z.string().optional(),
  region: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
  awsProfile: z.string().optional(),
  roleArn: z.string().optional(),
  extraHeaders: z.record(z.string()).optional(),
});

const modelEntrySchema = z.object({
  key: z.string(),
  displayName: z.string(),
  provider: z.string(),
  modelName: z.string(),
  deploymentName: z.string().optional(),
  maxInputTokens: z.number().positive().optional(),
  useResponsesApi: z.boolean().optional(),
});

const modelsConfigSchema = z.object({
  defaultModelKey: z.string(),
  providers: z.record(providerSchema),
  catalog: z.array(modelEntrySchema),
});

const memoryConfigSchema = z.object({
  enabled: z.boolean(),
  workingMemory: z.object({
    enabled: z.boolean(),
    scope: z.enum(['thread', 'resource']),
    template: z.string().optional(),
  }),
  observationalMemory: z.object({
    enabled: z.boolean(),
    scope: z.enum(['thread', 'resource']),
    deploymentName: z.string().optional(),
  }),
  semanticRecall: z.object({
    enabled: z.boolean(),
    topK: z.number().positive(),
    scope: z.enum(['thread', 'resource']),
    embeddingDeploymentName: z.string().optional(),
  }),
  lastMessages: z.number().positive(),
});

const toolCompactionSchema = z.object({
  enabled: z.boolean(),
  useAI: z.boolean(),
  triggerTokens: z.number().positive(),
  outputMaxTokens: z.number().positive(),
  truncateMinChars: z.number().positive(),
  truncateHeadRatio: z.number().min(0).max(1),
  truncateMinTailChars: z.number().positive(),
});

const conversationCompactionSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['legacy-summary', 'mastra-observational-memory']),
  triggerPercent: z.number().min(0).max(1),
  ignoreRecentUserMessages: z.number().nonnegative(),
  ignoreRecentAssistantMessages: z.number().nonnegative(),
  outputMaxTokens: z.number().positive(),
  promptReserveTokens: z.number().positive(),
  contextWindowTokens: z.number().positive().optional(),
});

const shellGuardrailsSchema = z.object({
  enabled: z.boolean(),
  timeout: z.number().positive(),
  allowPatterns: z.array(z.string()),
  denyPatterns: z.array(z.string()),
  requireConfirmation: z.boolean().optional(),
});

const fileAccessSchema = z.object({
  enabled: z.boolean(),
  allowPaths: z.array(z.string()),
  denyPaths: z.array(z.string()),
});

const processStreamingSchema = z.object({
  enabled: z.boolean(),
  updateIntervalMs: z.number().positive(),
  modelFeedMode: z.enum(['incremental', 'final-only']),
  maxOutputBytes: z.number().positive(),
  truncationMode: z.enum(['head', 'tail', 'head-tail']),
  stopAfterMax: z.boolean(),
  headTailRatio: z.number().min(0).max(1),
  observer: z.object({
    enabled: z.boolean(),
    intervalMs: z.number().positive(),
    maxSnapshotChars: z.number().positive(),
    maxMessagesPerTool: z.number().positive(),
    maxTotalLaunchedTools: z.number().positive(),
  }),
});

const mcpServerSchema = z.object({
  name: z.string(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
});

const agentLatticeOAuthSchema = z.object({
  authorizeUrl: z.string(),
  callbackHost: z.string().optional(),
  callbackPort: z.number().positive(),
  cookieDomain: z.string().optional(),
  cookieName: z.string().optional(),
  tokenCheckIntervalMs: z.number().positive(),
  tokenWarningBeforeExpiryMs: z.number().positive(),
});

const agentLatticeConfigSchema = z.object({
  enabled: z.boolean(),
  agentUrl: z.string(),
  oauth: agentLatticeOAuthSchema,
});

const subAgentConfigSchema = z.object({
  enabled: z.boolean(),
  maxDepth: z.number().positive().max(10),
  maxConcurrent: z.number().positive().max(20),
  maxPerParent: z.number().positive().max(10),
  defaultModel: z.string().optional(),
});

const titleGenerationSchema = z.object({
  enabled: z.boolean(),
  retitleIntervalMessages: z.number().positive(),
  retitleEagerUntilMessage: z.number().nonnegative(),
});

const legionRuntimeSchema = z.object({
  rootPath: z.string(),
  configDir: z.string(),
  daemonUrl: z.string(),
  rubyPath: z.string(),
});

const runtimeConfigSchema = z.object({
  agentBackend: z.enum(['mastra', 'legion-embedded', 'legion-daemon']),
  legion: legionRuntimeSchema,
});

export const legionConfigSchema = z.object({
  models: modelsConfigSchema,
  runtime: runtimeConfigSchema,
  memory: memoryConfigSchema,
  compaction: z.object({
    tool: toolCompactionSchema,
    conversation: conversationCompactionSchema,
  }),
  tools: z.object({
    shell: shellGuardrailsSchema,
    fileAccess: fileAccessSchema,
    processStreaming: processStreamingSchema,
    subAgents: subAgentConfigSchema,
  }),
  mcpServers: z.array(mcpServerSchema),
  skills: z.object({
    directory: z.string(),
    enabled: z.array(z.string()),
  }),
  systemPrompt: z.string(),
  agentLattice: agentLatticeConfigSchema,
  ui: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    sidebarWidth: z.number().positive(),
  }),
  advanced: z.object({
    temperature: z.number().min(0).max(2),
    maxSteps: z.number().positive(),
    maxRetries: z.number().nonnegative(),
    useResponsesApi: z.boolean(),
  }),
  titleGeneration: titleGenerationSchema,
});

export type LegionConfig = z.infer<typeof legionConfigSchema>;
