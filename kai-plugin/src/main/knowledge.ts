import { readFileSync } from 'node:fs';
import type { PluginAPI, DaemonResult } from './types.js';
import { daemonJson } from './daemon-client.js';
import { cleanText, clampNumber } from './utils.js';

/* ── Knowledge / Apollo query ── */

export async function knowledgeQuery(
  api: PluginAPI,
  query: string,
  limit: number = 10,
): Promise<DaemonResult> {
  if (!query) return { ok: false, error: 'A knowledge query is required.' };
  return daemonJson(api, '/api/apollo/query', {
    method: 'POST',
    body: {
      query,
      limit,
      agent_id: 'kai-legion-plugin',
    },
    timeoutMs: 30_000,
  });
}

/* ── Knowledge browse ── */

export async function knowledgeBrowse(
  api: PluginAPI,
  filters: Record<string, unknown> = {},
): Promise<DaemonResult> {
  const body: Record<string, unknown> = {
    query: cleanText((filters.tag as string) || (filters.source as string)) || '*',
    limit: clampNumber(filters.per_page as number, 1, 200, 50),
    agent_id: 'kai-legion-plugin',
  };
  const tag = cleanText(filters.tag as string);
  if (tag) body.tags = [tag];
  return daemonJson(api, '/api/apollo/query', {
    method: 'POST',
    body,
    timeoutMs: 30_000,
  });
}

/* ── Knowledge delete ── */

export async function knowledgeDelete(
  api: PluginAPI,
  id: string,
): Promise<DaemonResult> {
  if (!id) return { ok: false, error: 'An entry id is required.' };
  return daemonJson(api, `/api/apollo/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ── Knowledge ingest content ── */

export async function knowledgeIngestContent(
  api: PluginAPI,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<DaemonResult> {
  if (!content) return { ok: false, error: 'Knowledge content is required.' };
  return daemonJson(api, '/api/apollo/ingest', {
    method: 'POST',
    body: {
      content,
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    },
    timeoutMs: 30_000,
  });
}

/* ── Knowledge ingest file ── */

export async function knowledgeIngestFile(
  api: PluginAPI,
  filePath: string,
): Promise<DaemonResult> {
  if (!filePath) return { ok: false, error: 'A file path is required.' };

  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  const binaryTypes = [
    'pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt',
    'zip', 'gz', 'tar', 'png', 'jpg', 'jpeg', 'gif', 'webp',
  ];
  if (binaryTypes.includes(extension)) {
    return {
      ok: false,
      error: `Binary file type .${extension} requires daemon-side extraction. Use the absorber pipeline for this file type.`,
    };
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return daemonJson(api, '/api/apollo/ingest', {
      method: 'POST',
      body: {
        content,
        source_channel: 'desktop',
        source_agent: 'kai-legion-plugin',
        source_provider: filePath.split('/').pop() || filePath,
        tags: ['uploaded-file'],
      },
      timeoutMs: 30_000,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/* ── Knowledge monitors ── */

export async function knowledgeMonitorsList(api: PluginAPI): Promise<DaemonResult> {
  return daemonJson(api, '/api/extensions/knowledge/runners/monitors/list', {
    fallbackPath: '/api/lex/knowledge/monitors',
  });
}

export async function knowledgeMonitorAdd(
  api: PluginAPI,
  path: string,
): Promise<DaemonResult> {
  if (!path) return { ok: false, error: 'A monitor path is required.' };
  return daemonJson(api, '/api/extensions/knowledge/runners/monitors/create', {
    method: 'POST',
    body: { path },
    fallbackPath: '/api/lex/knowledge/monitors',
  });
}

export async function knowledgeMonitorRemove(
  api: PluginAPI,
  id: string,
): Promise<DaemonResult> {
  if (!id) return { ok: false, error: 'A monitor id is required.' };
  return daemonJson(
    api,
    `/api/extensions/knowledge/runners/monitors/delete?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      fallbackPath: `/api/lex/knowledge/monitors/${encodeURIComponent(id)}`,
    },
  );
}

export async function knowledgeMonitorScan(
  api: PluginAPI,
  id: string,
): Promise<DaemonResult> {
  if (!id) return { ok: false, error: 'A monitor id is required.' };
  return daemonJson(
    api,
    `/api/extensions/knowledge/runners/monitors/scan?id=${encodeURIComponent(id)}`,
    {
      method: 'POST',
      body: {},
      fallbackPath: `/api/lex/knowledge/monitors/${encodeURIComponent(id)}/scan`,
    },
  );
}
