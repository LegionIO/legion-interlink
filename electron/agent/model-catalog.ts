import type { LegionConfig } from '../config/schema.js';

export type LLMProviderType = 'openai-compatible' | 'anthropic' | 'amazon-bedrock' | 'google';

export type LLMModelConfig = {
  provider: LLMProviderType;
  endpoint: string;
  apiKey: string;
  apiVersion?: string;
  deploymentName?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  awsProfile?: string;
  roleArn?: string;
  modelName: string;
  maxInputTokens?: number;
  useResponsesApi?: boolean;
  extraHeaders?: Record<string, string>;
  temperature: number;
  maxSteps?: number;
  maxRetries?: number;
};

export type ModelCatalogEntry = {
  key: string;
  displayName: string;
  modelConfig: LLMModelConfig;
};

export function resolveModelCatalog(config: LegionConfig): {
  entries: ModelCatalogEntry[];
  defaultEntry: ModelCatalogEntry | null;
  byKey: Map<string, ModelCatalogEntry>;
} {
  const entries: ModelCatalogEntry[] = [];
  const byKey = new Map<string, ModelCatalogEntry>();

  for (const model of config.models.catalog) {
    const providerConfig = config.models.providers[model.provider];
    if (!providerConfig) continue;

    const modelConfig: LLMModelConfig = {
      provider: providerConfig.type,
      endpoint: providerConfig.endpoint ?? '',
      apiKey: providerConfig.apiKey ?? '',
      apiVersion: providerConfig.apiVersion,
      region: providerConfig.region,
      accessKeyId: providerConfig.accessKeyId,
      secretAccessKey: providerConfig.secretAccessKey,
      sessionToken: providerConfig.sessionToken,
      awsProfile: providerConfig.awsProfile,
      roleArn: providerConfig.roleArn,
      extraHeaders: providerConfig.extraHeaders,
      deploymentName: model.deploymentName,
      modelName: model.modelName,
      maxInputTokens: model.maxInputTokens,
      useResponsesApi: model.useResponsesApi ?? config.advanced.useResponsesApi,
      temperature: config.advanced.temperature,
      maxSteps: config.advanced.maxSteps,
      maxRetries: config.advanced.maxRetries,
    };

    const entry: ModelCatalogEntry = {
      key: model.key,
      displayName: model.displayName,
      modelConfig,
    };

    entries.push(entry);
    byKey.set(model.key, entry);
  }

  const defaultEntry = byKey.get(config.models.defaultModelKey) ?? entries[0] ?? null;

  return { entries, defaultEntry, byKey };
}

export function resolveModelForThread(
  config: LegionConfig,
  threadModelKey: string | null,
): ModelCatalogEntry | null {
  const catalog = resolveModelCatalog(config);
  if (threadModelKey && catalog.byKey.has(threadModelKey)) {
    return catalog.byKey.get(threadModelKey)!;
  }
  return catalog.defaultEntry;
}
