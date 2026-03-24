/**
 * IPC handlers for the Realtime Audio session.
 * Bridges the renderer process to the RealtimeSession in the main process.
 */

import type { IpcMain } from 'electron';
import { RealtimeSession } from '../realtime/realtime-session.js';
import type { LegionConfig } from '../config/schema.js';
import type { ToolDefinition } from '../tools/types.js';

let activeSession: RealtimeSession | null = null;

export function registerRealtimeHandlers(
  ipcMain: IpcMain,
  getConfig: () => LegionConfig,
  getTools: () => ToolDefinition[],
): void {
  ipcMain.handle('realtime:start-session', async (_event, conversationId: string) => {
    try {
      // End any existing session
      if (activeSession) {
        activeSession.close();
        activeSession = null;
      }

      const tools = getTools();
      activeSession = new RealtimeSession(getConfig, tools);
      await activeSession.start(conversationId);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Realtime IPC] Failed to start session:', msg);
      return { error: msg };
    }
  });

  ipcMain.handle('realtime:end-session', async () => {
    if (activeSession) {
      activeSession.close();
      activeSession = null;
    }
    return { ok: true };
  });

  // Fire-and-forget audio sending (use ipcMain.on, not handle)
  ipcMain.on('realtime:send-audio', (_event, pcmBase64: string) => {
    activeSession?.sendAudio(pcmBase64);
  });

  ipcMain.handle('realtime:get-status', () => {
    return {
      status: activeSession?.status ?? 'idle',
    };
  });
}
