import test from 'node:test';
import assert from 'node:assert/strict';
import { providerLayerConfigSchema } from './schema.js';

test('providerLayerConfigSchema exposes daemon router fallback while accepting legacy RubyLLM key', () => {
  assert.equal(providerLayerConfigSchema.parse({}).fallbackToDaemonRouter, true);
  assert.equal(
    providerLayerConfigSchema.parse({ fallbackToDaemonRouter: false }).fallbackToDaemonRouter,
    false,
  );
  const legacy = providerLayerConfigSchema.parse({ mode: 'ruby_llm', fallbackToRubyLlm: false });
  assert.equal(legacy.mode, 'daemon_router');
  assert.equal(legacy.fallbackToDaemonRouter, false);
  assert.equal('fallbackToRubyLlm' in legacy, false);
});
