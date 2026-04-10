/**
 * Memory system stub.
 *
 * The standalone Mastra memory system has been removed.
 * Knowledge and memory are managed by the Legion daemon (Apollo).
 */

export function getSharedMemory(_config: unknown, _dbPath?: string): null {
  return null;
}

export function getResourceId(): string {
  return 'legion-interlink';
}

export async function testEmbeddingConnection(_config: unknown): Promise<{ ok: false; error: string }> {
  return { ok: false, error: 'Standalone memory system has been removed. Use the Legion daemon.' };
}
