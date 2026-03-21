import type { IpcMain } from 'electron';
import { connectMcpServer, disconnectMcpServer } from '../tools/mcp-client.js';

type McpServerInput = {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

export function registerMcpHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('mcp:test-connection', async (_event, server: McpServerInput) => {
    // Use a temporary name so we don't pollute the real connection pool
    const testName = `__test__${server.name}__${Date.now()}`;
    try {
      const conn = await connectMcpServer({ ...server, name: testName });
      return {
        status: conn.status,
        toolCount: conn.tools.length,
        error: conn.error,
      };
    } catch (error) {
      return {
        status: 'error' as const,
        toolCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await disconnectMcpServer(testName);
    }
  });
}
