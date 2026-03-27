import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import type {
  StartComputerSessionOptions,
  ComputerUseEvent,
  ComputerUsePermissionSection,
  ComputerUseSurface,
} from '../../shared/computer-use.js';
import { getComputerUseManager } from '../computer-use/service.js';
import type { LegionConfig } from '../config/schema.js';
import { readConversationStore, writeConversationStore, broadcastConversationChange } from './conversations.js';

function broadcast(event: ComputerUseEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('computer-use:event', event);
  }
}

/**
 * Find the primary application window (not overlay or operator windows).
 * The main window is the only one that is resizable and focusable.
 */
function findMainWindow(): BrowserWindow | null {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    // Overlays and operator windows are created with resizable: false and/or focusable: false.
    // The main window is resizable and focusable.
    if (win.isResizable() && win.isFocusable()) {
      return win;
    }
  }
  return null;
}

export function registerComputerUseHandlers(
  ipcMain: IpcMain,
  legionHome: string,
  getConfig: () => LegionConfig,
): void {
  const manager = getComputerUseManager(legionHome, getConfig);
  manager.on('event', (event: ComputerUseEvent) => {
    broadcast(event);
  });

  ipcMain.handle('computer-use:start-session', async (_event, goal: string, options: StartComputerSessionOptions) => {
    return manager.startSession(goal, options);
  });
  ipcMain.handle('computer-use:pause-session', (_event, sessionId: string) => manager.pauseSession(sessionId));
  ipcMain.handle('computer-use:resume-session', (_event, sessionId: string) => manager.resumeSession(sessionId));
  ipcMain.handle('computer-use:stop-session', (_event, sessionId: string) => manager.stopSession(sessionId));
  ipcMain.handle('computer-use:approve-action', (_event, sessionId: string, actionId: string) => manager.approveAction(sessionId, actionId));
  ipcMain.handle('computer-use:reject-action', (_event, sessionId: string, actionId: string, reason?: string) => manager.rejectAction(sessionId, actionId, reason));
  ipcMain.handle('computer-use:list-sessions', () => manager.listSessions());
  ipcMain.handle('computer-use:get-session', (_event, sessionId: string) => manager.getSession(sessionId));
  ipcMain.handle('computer-use:set-surface', (_event, sessionId: string, surface: ComputerUseSurface) => manager.setSurface(sessionId, surface));
  ipcMain.handle('computer-use:send-guidance', (_event, sessionId: string, text: string) => manager.sendGuidance(sessionId, text));
  ipcMain.handle('computer-use:continue-session', (_event, sessionId: string, newGoal: string) => manager.continueSession(sessionId, newGoal));
  ipcMain.handle('computer-use:mark-sessions-seen', (_event, conversationId: string) => { manager.markConversationSessionsSeen(conversationId); return { ok: true }; });
  ipcMain.handle('computer-use:open-setup-window', (_event, conversationId?: string | null) => manager.openSetupWindow(conversationId));
  ipcMain.handle('computer-use:get-local-macos-permissions', () => manager.getLocalMacosPermissions());
  ipcMain.handle('computer-use:request-local-macos-permissions', () => manager.requestLocalMacosPermissions());
  ipcMain.handle('computer-use:open-local-macos-privacy-settings', (_event, section?: ComputerUsePermissionSection) => manager.openLocalMacosPrivacySettings(section));

  ipcMain.handle('computer-use:focus-session', (_event, sessionId: string) => {
    const session = manager.getSession(sessionId);
    if (!session) return { ok: false, error: 'Session not found' };

    // Switch active conversation to the one owning this computer-use session
    const store = readConversationStore(legionHome);
    if (store.conversations[session.conversationId]) {
      store.activeConversationId = session.conversationId;
      writeConversationStore(legionHome, store);
      broadcastConversationChange(store);
    }

    // Focus the main window and tell its renderer to switch to the computer tab
    const mainWin = findMainWindow();
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      if (!mainWin.isVisible()) mainWin.show();
      mainWin.focus();
      mainWin.webContents.send('computer-use:focus-thread');
    }

    return { ok: true };
  });
}
