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

function broadcast(event: ComputerUseEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('computer-use:event', event);
  }
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
  ipcMain.handle('computer-use:open-setup-window', (_event, conversationId?: string | null) => manager.openSetupWindow(conversationId));
  ipcMain.handle('computer-use:get-local-macos-permissions', () => manager.getLocalMacosPermissions());
  ipcMain.handle('computer-use:request-local-macos-permissions', () => manager.requestLocalMacosPermissions());
  ipcMain.handle('computer-use:open-local-macos-privacy-settings', (_event, section?: ComputerUsePermissionSection) => manager.openLocalMacosPrivacySettings(section));
}
