import type { PluginAPI, ProactiveMessage } from './types.js';
import { getPluginConfig } from './config.js';
import { getCurrentState, replaceState, updateState } from './state.js';
import { registerConversationDecoration } from './ui.js';
import { PROACTIVE_THREAD_ID, BACKEND_KEY } from './constants.js';
import { cleanText } from './utils.js';
import { randomUUID } from 'node:crypto';

/* ── Module-scoped managed conversation set ── */

export const managedConversationIds = new Set<string>();

/* ── Hydrate managed conversations from existing data ── */

export function hydrateManagedConversations(api: PluginAPI): void {
  managedConversationIds.clear();
  const conversations = api.conversations.list();

  for (const conversation of conversations) {
    const metadata = (conversation?.metadata || {}) as Record<string, unknown>;
    if (metadata.pluginName !== 'legion') continue;

    managedConversationIds.add(conversation.id);
    registerConversationDecoration(
      api,
      conversation.id,
      metadata.legionKind === 'proactive' ? 'GAIA' : 'Legion',
    );
  }
}

/* ── Create a managed conversation ── */

export async function createManagedConversation(
  api: PluginAPI,
  options: { title?: string; prompt?: string; open?: boolean; kind?: string },
): Promise<Record<string, unknown>> {
  const config = getPluginConfig(api);
  const kind = cleanText(options.kind) || 'workspace';
  const conversationId = kind === 'proactive' ? PROACTIVE_THREAD_ID : randomUUID();
  const now = new Date().toISOString();
  const title = cleanText(options.title)
    || (kind === 'proactive' ? config.proactiveThreadTitle : config.workspaceThreadTitle);
  const initialPrompt = cleanText(options.prompt)
    || (kind === 'proactive' ? `${config.proactivePromptPrefix}.` : config.bootstrapPrompt);
  const selectedBackendKey = kind === 'proactive'
    ? null
    : (config.backendEnabled ? BACKEND_KEY : null);

  const existing = api.conversations.get(conversationId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ex = existing as any;

  api.conversations.upsert({
    id: conversationId,
    title,
    fallbackTitle: title,
    messages: ex?.messages || [],
    messageTree: ex?.messageTree || [],
    headId: ex?.headId || null,
    conversationCompaction: null,
    lastContextUsage: null,
    createdAt: ex?.createdAt || now,
    updatedAt: now,
    lastMessageAt: ex?.lastMessageAt || null,
    titleStatus: 'ready',
    titleUpdatedAt: now,
    messageCount: ex?.messageCount || 0,
    userMessageCount: ex?.userMessageCount || 0,
    runStatus: 'idle',
    hasUnread: ex?.hasUnread || false,
    lastAssistantUpdateAt: ex?.lastAssistantUpdateAt || null,
    selectedModelKey: ex?.selectedModelKey || null,
    selectedProfileKey: ex?.selectedProfileKey || null,
    fallbackEnabled: ex?.fallbackEnabled || false,
    profilePrimaryModelKey: ex?.profilePrimaryModelKey || null,
    currentWorkingDirectory: ex?.currentWorkingDirectory || null,
    selectedBackendKey,
    metadata: {
      ...(ex?.metadata || {}),
      pluginName: 'legion',
      source: 'legion-plugin',
      legionKind: kind,
      serviceUrl: config.daemonUrl || null,
    },
  });

  managedConversationIds.add(conversationId);
  const decorationLabel = kind === 'proactive'
    ? 'GAIA'
    : kind === 'subagent'
      ? `Legion \u00b7 sub-agent`
      : `Legion \u00b7 ${kind}`;
  registerConversationDecoration(
    api,
    conversationId,
    decorationLabel,
  );

  if (initialPrompt && (!existing || (existing.messageCount || 0) === 0)) {
    api.conversations.appendMessage(conversationId, {
      role: 'assistant',
      content: [{ type: 'text', text: initialPrompt }],
      metadata: {
        pluginName: 'legion',
        kind: `${kind}-bootstrap`,
      },
      createdAt: now,
    });
  }

  if (options.open !== false) {
    api.conversations.setActive(conversationId);
  }

  const nextState = replaceState(api, {
    managedConversationIds: [...managedConversationIds],
    lastConversationId: conversationId,
    lastConversationTitle: title,
    proactiveConversationId: kind === 'proactive'
      ? conversationId
      : (getCurrentState(api).proactiveConversationId ?? null),
  }, {
    reason: 'conversation-created',
    recordHistory: true,
  });

  api.state.emitEvent('conversation-created', {
    conversationId,
    title,
    selectedBackendKey,
    kind,
  });

  if (config.notificationsEnabled && kind !== 'proactive') {
    api.notifications.show({
      id: `conversation-${conversationId}`,
      title: 'Legion thread created',
      body: `${title}${selectedBackendKey ? ' using Legion backend' : ''}`,
      level: 'info',
      native: false,
      autoDismissMs: 4_000,
      target: { type: 'conversation', conversationId },
    });
  }

  return {
    ok: true,
    conversationId,
    title,
    selectedBackendKey,
    state: nextState,
  };
}

/* ── Proactive conversation management ── */

export async function ensureProactiveConversation(api: PluginAPI): Promise<string> {
  const existing = api.conversations.get(PROACTIVE_THREAD_ID);
  if (existing) {
    managedConversationIds.add(existing.id);
    registerConversationDecoration(api, existing.id, 'GAIA');
    replaceState(api, {
      proactiveConversationId: existing.id,
      managedConversationIds: [...managedConversationIds],
    });
    return existing.id;
  }

  const created = await createManagedConversation(api, {
    kind: 'proactive',
    open: false,
  });
  return created.conversationId as string;
}

export async function openProactiveConversation(
  api: PluginAPI,
): Promise<Record<string, unknown>> {
  const conversationId = await ensureProactiveConversation(api);
  api.conversations.setActive(conversationId);
  return { ok: true, conversationId };
}

/* ── Append proactive message ── */

export async function appendProactiveMessage(
  api: PluginAPI,
  proactiveMessage: ProactiveMessage,
): Promise<Record<string, unknown>> {
  const conversationId = await ensureProactiveConversation(api);
  const conversation = api.conversations.get(conversationId);
  const messageTree = Array.isArray((conversation as Record<string, unknown> | null)?.messageTree)
    ? (conversation as Record<string, unknown>).messageTree as Array<Record<string, unknown>>
    : [];

  if (
    messageTree.some(
      (entry) =>
        (entry?.metadata as Record<string, unknown> | undefined)?.eventId === proactiveMessage.id,
    )
  ) {
    return { ok: true, duplicate: true, conversationId };
  }

  api.conversations.appendMessage(conversationId, {
    role: 'assistant',
    content: [{ type: 'text', text: proactiveMessage.content }],
    metadata: {
      pluginName: 'legion',
      legionKind: 'proactive',
      eventId: proactiveMessage.id,
      intent: proactiveMessage.intent,
      source: proactiveMessage.source,
      ...proactiveMessage.metadata,
    },
    createdAt: proactiveMessage.timestamp,
  });
  api.conversations.markUnread(conversationId, true);

  // Update GAIA thread decoration to reflect the latest event type
  const intentLabel = proactiveMessage.intent || 'activity';
  registerConversationDecoration(api, conversationId, `GAIA \u00b7 ${intentLabel}`);

  const state = updateState(
    api,
    (previous) => ({
      ...previous,
      proactiveConversationId: conversationId,
      proactiveMessages: [
        proactiveMessage,
        ...(Array.isArray(previous.proactiveMessages) ? previous.proactiveMessages : []),
      ],
    }),
    {
      reason: 'proactive-message',
      recordHistory: false,
    },
  );

  const config = getPluginConfig(api);
  if (config.openProactiveThread) {
    api.navigation.open({ type: 'conversation', conversationId });
  }

  return { ok: true, conversationId, state };
}
