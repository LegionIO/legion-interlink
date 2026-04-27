import type { IpcMain } from 'electron';
import type { AppConfig } from '../config/schema.js';
import { listCliToolStatus } from '../tools/cli-tools.js';

export function registerCliToolsHandlers(
  ipcMain: IpcMain,
  getConfig: () => AppConfig,
): void {
  ipcMain.handle('cli-tools:list', () => {
    return listCliToolStatus(getConfig());
  });
}
