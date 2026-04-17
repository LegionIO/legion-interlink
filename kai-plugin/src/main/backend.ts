import type { PluginAPI, PluginConfig } from './types.js';
import { getPluginConfig } from './config.js';
import { BACKEND_KEY } from './constants.js';
import { streamFromDaemon } from './backend-stream.js';

/* ── Module-scoped registration flag ── */

let backendRegistered: boolean = false;

/* ── Public accessors ── */

export function isBackendRegistered(): boolean {
  return backendRegistered;
}

export function setBackendRegistered(val: boolean): void {
  backendRegistered = val;
}

/* ── Backend registration / unregistration ── */

export function ensureBackendRegistration(api: PluginAPI, config: PluginConfig): void {
  const shouldRegister = Boolean(
    config.enabled && config.backendEnabled && config.daemonUrl,
  );

  if (shouldRegister && !backendRegistered) {
    api.agent.registerBackend({
      key: BACKEND_KEY,
      displayName: 'Legion',
      isAvailable: () => {
        const currentConfig = getPluginConfig(api);
        return Boolean(
          currentConfig.enabled && currentConfig.backendEnabled && currentConfig.daemonUrl,
        );
      },
      stream: async function* (options: unknown) {
        yield* streamFromDaemon(api, options as Record<string, unknown>);
      },
    });
    backendRegistered = true;
    api.state.emitEvent('backend-registered', { key: BACKEND_KEY });
    return;
  }

  if (!shouldRegister && backendRegistered) {
    api.agent.unregisterBackend(BACKEND_KEY);
    backendRegistered = false;
    api.state.emitEvent('backend-unregistered', { key: BACKEND_KEY });
  }
}
