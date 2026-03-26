import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { LegionConfig } from '../config/schema.js';
import { getComputerUseManager } from '../computer-use/service.js';

type ConversationRecord = {
  id: string;
  title: string | null;
  fallbackTitle: string | null;
  messages: unknown[];
  conversationCompaction: unknown | null;
  lastContextUsage: unknown | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  titleStatus: 'idle' | 'generating' | 'ready' | 'error';
  titleUpdatedAt: string | null;
  messageCount: number;
  userMessageCount: number;
  runStatus: 'idle' | 'running' | 'error';
  hasUnread: boolean;
  lastAssistantUpdateAt: string | null;
  selectedModelKey: string | null;
  selectedProfileKey?: string | null;
  fallbackEnabled?: boolean;
  profilePrimaryModelKey?: string | null;
};

type ConversationsStore = {
  conversations: Record<string, ConversationRecord>;
  activeConversationId: string | null;
  settings: Record<string, unknown>;
};

function getStorePath(legionHome: string): string {
  return join(legionHome, 'data', 'conversations.json');
}

function readStore(legionHome: string): ConversationsStore {
  const storePath = getStorePath(legionHome);
  if (!existsSync(storePath)) {
    return { conversations: {}, activeConversationId: null, settings: {} };
  }
  try {
    return JSON.parse(readFileSync(storePath, 'utf-8'));
  } catch {
    return { conversations: {}, activeConversationId: null, settings: {} };
  }
}

function writeStore(legionHome: string, store: ConversationsStore): void {
  const storePath = getStorePath(legionHome);
  const dir = join(legionHome, 'data');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

function broadcastConversationChange(store: ConversationsStore): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('conversations:changed', store);
  }
}

export function registerConversationHandlers(ipcMain: IpcMain, legionHome: string, getConfig?: () => LegionConfig): void {
  ipcMain.handle('conversations:list', () => {
    const store = readStore(legionHome);
    const conversations = Object.values(store.conversations);
    // Sort by most recent activity
    conversations.sort((a, b) => {
      const aAt = a.lastAssistantUpdateAt ?? a.lastMessageAt ?? a.updatedAt ?? a.createdAt;
      const bAt = b.lastAssistantUpdateAt ?? b.lastMessageAt ?? b.updatedAt ?? b.createdAt;
      return bAt.localeCompare(aAt);
    });
    return conversations;
  });

  ipcMain.handle('conversations:get', (_event, id: string) => {
    const store = readStore(legionHome);
    return store.conversations[id] ?? null;
  });

  ipcMain.handle('conversations:put', (_event, conversation: ConversationRecord) => {
    const store = readStore(legionHome);
    store.conversations[conversation.id] = conversation;
    writeStore(legionHome, store);
    broadcastConversationChange(store);
    return { ok: true };
  });

  ipcMain.handle('conversations:delete', (_event, id: string) => {
    const store = readStore(legionHome);
    delete store.conversations[id];
    if (store.activeConversationId === id) {
      store.activeConversationId = null;
    }
    writeStore(legionHome, store);
    broadcastConversationChange(store);

    // Clean up associated computer-use sessions
    if (getConfig) {
      try {
        const manager = getComputerUseManager(legionHome, getConfig);
        manager.removeSessionsByConversation(id);
      } catch {
        // Computer-use module may not be initialized yet — safe to ignore
      }
    }

    return { ok: true };
  });

  ipcMain.handle('conversations:clear', () => {
    const store = readStore(legionHome);

    // Clean up all computer-use sessions
    if (getConfig) {
      try {
        const manager = getComputerUseManager(legionHome, getConfig);
        for (const conversationId of Object.keys(store.conversations)) {
          manager.removeSessionsByConversation(conversationId);
        }
      } catch {
        // Safe to ignore
      }
    }

    store.conversations = {};
    store.activeConversationId = null;
    writeStore(legionHome, store);
    broadcastConversationChange(store);
    return { ok: true };
  });

  ipcMain.handle('conversations:get-active-id', () => {
    const store = readStore(legionHome);
    return store.activeConversationId;
  });

  ipcMain.handle('conversations:set-active-id', (_event, id: string) => {
    const store = readStore(legionHome);
    store.activeConversationId = id;
    writeStore(legionHome, store);
    broadcastConversationChange(store);
    return { ok: true };
  });
}
