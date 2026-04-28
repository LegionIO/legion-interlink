import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeProviderModelObjects } from './llm-provider-models.js';

describe('normalizeProviderModelObjects', () => {
  it('keeps compatibility with name/default_model provider responses', () => {
    assert.deepEqual(
      normalizeProviderModelObjects({
        providers: [
          { name: 'openai', default_model: 'gpt-4.1' },
          { name: 'anthropic' },
        ],
      }),
      [{ id: 'gpt-4.1', owned_by: 'openai' }],
    );
  });

  it('reads provider/models inventory responses without duplicating defaults', () => {
    assert.deepEqual(
      normalizeProviderModelObjects({
        providers: [
          {
            provider: 'anthropic',
            circuit: 'closed',
            adjustment: 0,
            healthy: true,
            default_model: 'claude-sonnet-4-5',
            models: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
            offerings: [],
            types: ['chat'],
            instances: [],
          },
          {
            provider: 'bedrock',
            models: [
              { id: 'us.anthropic.claude-sonnet-4-5-v1:0' },
              { model: 'amazon.nova-pro-v1:0' },
            ],
          },
        ],
      }),
      [
        { id: 'claude-sonnet-4-5', owned_by: 'anthropic' },
        { id: 'claude-haiku-4-5', owned_by: 'anthropic' },
        { id: 'us.anthropic.claude-sonnet-4-5-v1:0', owned_by: 'bedrock' },
        { id: 'amazon.nova-pro-v1:0', owned_by: 'bedrock' },
      ],
    );
  });

  it('reads LegionIO provider-health inventory responses', () => {
    assert.deepEqual(
      normalizeProviderModelObjects({
        providers: [
          {
            provider: 'anthropic',
            circuit: 'closed',
            adjustment: 0,
            healthy: true,
            offerings: 1,
            models: ['claude-sonnet-4-6'],
            types: ['inference'],
            instances: ['bedrock-east-2'],
          },
        ],
      }),
      [{ id: 'claude-sonnet-4-6', owned_by: 'anthropic' }],
    );
  });

  it('ignores malformed entries and still returns usable model identifiers', () => {
    assert.deepEqual(
      normalizeProviderModelObjects({
        providers: [
          null,
          { provider: '', default_model: '' },
          { circuit: 'open', models: [null, {}, { name: 'usable-model' }] },
        ],
      }),
      [{ id: 'usable-model' }],
    );
  });
});
