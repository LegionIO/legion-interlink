import type { LegionConfig } from '../config/schema.js';
import { ComputerUseSessionManager } from './session-manager.js';

let manager: ComputerUseSessionManager | null = null;

export function getComputerUseManager(legionHome: string, getConfig: () => LegionConfig): ComputerUseSessionManager {
  manager ??= new ComputerUseSessionManager(legionHome, getConfig);
  return manager;
}

/** Returns the existing manager if already initialized, or null. */
export function getExistingComputerUseManager(): ComputerUseSessionManager | null {
  return manager;
}
