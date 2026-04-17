import type { PluginAPI, DaemonResult } from './types.js';
import { getPluginConfig } from './config.js';
import { daemonJson } from './daemon-client.js';
import { replaceState } from './state.js';

/* ── Doctor diagnostic checks ── */

export async function runDoctorChecks(api: PluginAPI): Promise<DaemonResult> {
  const checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    duration: number;
  }> = [];

  const runCheck = async (
    name: string,
    task: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ): Promise<void> => {
    const startedAt = Date.now();
    try {
      const result = await task();
      checks.push({
        name,
        status: result.ok ? 'pass' : 'warn',
        message: result.ok ? (result.message || 'OK') : (result.error || 'Failed'),
        duration: Date.now() - startedAt,
      });
    } catch (error) {
      checks.push({
        name,
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startedAt,
      });
    }
  };

  /* 1. Daemon Reachable */
  await runCheck('Daemon Reachable', async () => {
    const result = await daemonJson(api, getPluginConfig(api).readyPath, { quiet: true });
    return {
      ok: result.ok,
      message: result.ok ? 'Daemon is running and ready' : undefined,
      error: result.error,
    };
  });

  /* 2. Health Status */
  await runCheck('Health Status', async () => {
    const result = await daemonJson(api, getPluginConfig(api).healthPath, { quiet: true });
    return {
      ok: result.ok,
      message: result.ok ? 'Health check passed' : undefined,
      error: result.error,
    };
  });

  /* 3. Extensions Loaded */
  await runCheck('Extensions Loaded', async () => {
    const result = await daemonJson(api, '/api/catalog', { quiet: true });
    const count = Array.isArray(result.data) ? result.data.length : 0;
    return {
      ok: result.ok,
      message: result.ok ? `${count} extensions loaded` : undefined,
      error: result.error,
    };
  });

  /* 4. Transport Connected */
  await runCheck('Transport Connected', async () => {
    const result = await daemonJson(api, '/api/transport', { quiet: true });
    return {
      ok: result.ok,
      message: result.ok ? 'Transport layer connected' : undefined,
      error: result.error,
    };
  });

  /* 5. Workers Available */
  await runCheck('Workers Available', async () => {
    const result = await daemonJson(api, '/api/workers', { quiet: true });
    const count = Array.isArray(result.data) ? result.data.length : 0;
    return {
      ok: result.ok,
      message: result.ok ? `${count} workers registered` : undefined,
      error: result.error,
    };
  });

  /* 6. Schedules Active */
  await runCheck('Schedules Active', async () => {
    const result = await daemonJson(api, '/api/schedules', { quiet: true });
    const count = Array.isArray(result.data) ? result.data.length : 0;
    return {
      ok: result.ok,
      message: result.ok ? `${count} schedules configured` : undefined,
      error: result.error,
    };
  });

  /* 7. Audit Chain */
  await runCheck('Audit Chain', async () => {
    const result = await daemonJson(api, '/api/audit/verify', { quiet: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = Boolean((result.data as any)?.valid);
    return {
      ok: result.ok && valid,
      message: result.ok
        ? (valid ? 'Audit hash chain is valid' : 'Audit chain verification returned invalid')
        : undefined,
      error: result.error,
    };
  });

  replaceState(api, {
    doctorResults: checks,
    doctorCheckedAt: new Date().toISOString(),
  });

  return { ok: true, data: checks };
}
