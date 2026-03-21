import { z } from 'zod';
import { BrowserWindow } from 'electron';
import type { ToolDefinition } from './types.js';
import type { LegionConfig } from '../config/schema.js';
import { persistLegionModelsToLegion, readEffectiveConfig } from '../ipc/config.js';

function readConfig(legionHome: string): LegionConfig {
  return readEffectiveConfig(legionHome);
}

export function createModelSwitchTool(legionHome: string): ToolDefinition {
  // Read catalog at creation time to build a strict enum
  const config = readConfig(legionHome);
  const catalog = config.models.catalog;
  const modelKeys = catalog.map((m) => m.key) as [string, ...string[]];
  const modelDescriptions = catalog.map((m) => `"${m.key}" (${m.displayName})`).join(', ');

  return {
    name: 'switch_model',
    description: [
      'Switch the AI model used for the current conversation. The change takes effect on your next response turn.',
      `Available models: ${modelDescriptions}.`,
      'This also updates the default model in config for future conversations.',
    ].join(' '),
    inputSchema: z.object({
      model_key: z.enum(modelKeys).describe('The model key to switch to'),
    }),
    execute: async (input) => {
      const { model_key } = input as { model_key: string };

      const currentConfig = readConfig(legionHome);
      const entry = currentConfig.models.catalog.find((m) => m.key === model_key);
      if (!entry) {
        const available = currentConfig.models.catalog.map((m) => m.key).join(', ');
        return { error: `Model "${model_key}" not found. Available: ${available}` };
      }

      const previousKey = currentConfig.models.defaultModelKey;
      const previousEntry = currentConfig.models.catalog.find((m) => m.key === previousKey);

      persistLegionModelsToLegion('models.defaultModelKey', model_key, currentConfig);

      // Notify renderer to update the active model selector
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('agent:model-switched', model_key);
      }

      return {
        success: true,
        changed: {
          previous: { key: previousKey, displayName: previousEntry?.displayName ?? previousKey },
          new: { key: model_key, displayName: entry.displayName },
        },
        message: `Switched from ${previousEntry?.displayName ?? previousKey} to ${entry.displayName}. Next response will use this model.`,
      };
    },
  };
}
