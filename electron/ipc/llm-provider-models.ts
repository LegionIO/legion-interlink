export type OpenAIModelObject = { id: string; owned_by?: string };

type ProviderInventory = {
  providers?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

function modelId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!isRecord(value)) return null;
  return stringField(value, ['id', 'model', 'name', 'key', 'model_id']);
}

function providerEntries(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;
  if (!isRecord(response)) return [];

  const providers = (response as ProviderInventory).providers;
  return Array.isArray(providers) ? providers : [];
}

export function normalizeProviderModelObjects(response: unknown): OpenAIModelObject[] {
  const models: OpenAIModelObject[] = [];
  const seen = new Set<string>();

  for (const entry of providerEntries(response)) {
    if (!isRecord(entry)) continue;

    const providerName = stringField(entry, ['provider', 'name']) ?? undefined;
    const ids = new Set<string>();
    const defaultModel = stringField(entry, ['default_model', 'defaultModel']);
    if (defaultModel) ids.add(defaultModel);

    const rawModels = entry.models;
    if (Array.isArray(rawModels)) {
      for (const rawModel of rawModels) {
        const id = modelId(rawModel);
        if (id) ids.add(id);
      }
    }

    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      models.push(providerName ? { id, owned_by: providerName } : { id });
    }
  }

  return models;
}
