import { useEffect, useMemo, useRef, useState, useCallback, type FC } from 'react';
import { PlusIcon, SearchIcon, Trash2Icon, MessageSquareIcon, LoaderIcon, XIcon, PanelTopOpenIcon, SlidersHorizontalIcon } from 'lucide-react';
import { legion } from '@/lib/ipc-client';
import { EditableInput } from '@/components/EditableInput';
import type { ConversationRecord } from '@/providers/RuntimeProvider';

type ConversationSummary = Pick<
  ConversationRecord,
  'id' | 'title' | 'fallbackTitle' | 'createdAt' | 'updatedAt' | 'lastMessageAt' |
  'messageCount' | 'userMessageCount' | 'runStatus' | 'hasUnread' | 'lastAssistantUpdateAt'
>;

type ConversationListProps = {
  activeConversationId: string | null;
  onSwitchConversation: (id: string) => void;
  onNewConversation: () => void;
};

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return 'No messages';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  return `${Math.floor(diffMs / 604_800_000)}w ago`;
}

function getDisplayTitle(conv: ConversationSummary): string {
  return conv.title?.trim() || conv.fallbackTitle?.trim() || 'New Conversation';
}

const TypingBubble: FC = () => (
  <div className="flex items-center gap-0.5 px-1">
    <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
    <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
    <div className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
  </div>
);

/**
 * Double-click-confirm hook: first click arms, second click within timeout executes.
 * Returns { armed, onClick, reset }.
 */
function useDoubleClickConfirm(onConfirm: () => void, timeoutMs = 2500) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setArmed(false);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const onClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (armed) {
      reset();
      onConfirm();
    } else {
      setArmed(true);
      timerRef.current = setTimeout(reset, timeoutMs);
    }
  }, [armed, onConfirm, reset, timeoutMs]);

  // Cleanup on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { armed, onClick, reset };
}

/** Per-conversation delete button with single-click delete */
const ConversationDeleteButton: FC<{ onDelete: () => Promise<void>; isDeleting: boolean }> = ({ onDelete, isDeleting }) => {
  if (isDeleting) {
    return <LoaderIcon className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void onDelete();
      }}
      className="shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10"
      title="Delete conversation"
    >
      <Trash2Icon className="h-3 w-3 text-muted-foreground hover:text-destructive" />
    </button>
  );
};

export const ConversationList: FC<ConversationListProps> = ({
  activeConversationId,
  onSwitchConversation,
  onNewConversation,
}) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadConversations = async () => {
    try {
      const list = await legion.conversations.list() as ConversationSummary[];
      setConversations(list);
    } catch {
      // IPC not ready
    }
  };

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 1500);
    return () => clearInterval(interval);
  }, []);

  const isSearchActive = searchQuery.trim().length > 0;

  const filteredConversations = useMemo(() => {
    if (!isSearchActive) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) =>
      getDisplayTitle(c).toLowerCase().includes(q),
    );
  }, [conversations, searchQuery, isSearchActive]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await legion.conversations.delete(id);
    await loadConversations();
    setDeletingId(null);
  };

  const handleDeleteBulk = async () => {
    const idsToDelete = filteredConversations.map((c) => c.id);
    for (const id of idsToDelete) {
      await legion.conversations.delete(id);
    }
    await loadConversations();
  };

  const handleClearUnread = async (id: string) => {
    const conv = await legion.conversations.get(id) as ConversationRecord | null;
    if (conv?.hasUnread) {
      await legion.conversations.put({ ...conv, hasUnread: false });
    }
    onSwitchConversation(id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-sidebar-border/70 px-4 py-3">
        <button
          type="button"
          onClick={onNewConversation}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80"
        >
          <PlusIcon className="h-4 w-4 text-primary" />
          New thread
        </button>
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Threads</span>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button type="button" className="rounded-md p-1.5 transition-colors hover:bg-sidebar-accent/80" title="Organize threads">
            <PanelTopOpenIcon className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-md p-1.5 transition-colors hover:bg-sidebar-accent/80" title="Filter threads">
            <SlidersHorizontalIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/45 px-3 py-2">
          <SearchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <EditableInput
            placeholder="Search..."
            value={searchQuery}
            onChange={setSearchQuery}
            className="flex-1 bg-transparent text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="shrink-0 p-0.5 rounded hover:bg-sidebar-accent transition-colors"
            >
              <XIcon className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        {filteredConversations.map((conv) => {
          const isActive = conv.id === activeConversationId;
          const isRunning = conv.runStatus === 'running';
          const hasUnread = conv.hasUnread && !isActive;

          return (
            <div
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => handleClearUnread(conv.id)}
              onKeyDown={(e) => e.key === 'Enter' && handleClearUnread(conv.id)}
              className={`
                mb-1.5 flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-all group cursor-pointer relative
                ${isActive ? 'shadow-[inset_0_0_0_1px_var(--legion-active-item-ring)]' : 'hover:bg-sidebar-accent/65'}
                ${hasUnread && !isActive ? 'bg-sidebar-accent/45' : ''}
              `}
              style={isActive ? { backgroundColor: 'var(--legion-active-item)' } : undefined}
            >
              <MessageSquareIcon className={`mt-0.5 h-4 w-4 shrink-0 ${hasUnread ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <span className={`line-clamp-2 text-sm ${hasUnread ? 'font-semibold text-sidebar-foreground' : 'font-medium text-sidebar-foreground/95'}`}>
                  {getDisplayTitle(conv)}
                </span>
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  {formatRelativeTime(conv.lastAssistantUpdateAt ?? conv.lastMessageAt)}
                  {conv.messageCount > 0 && ` · ${conv.messageCount} msgs`}
                </span>
              </div>
              <div className="ml-1 flex shrink-0 flex-col items-center gap-1">
                {hasUnread && <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_rgba(197,194,245,0.38)]" />}
                {isRunning && <TypingBubble />}
                <ConversationDeleteButton
                  onDelete={() => handleDelete(conv.id)}
                  isDeleting={deletingId === conv.id}
                />
              </div>
            </div>
          );
        })}

        {filteredConversations.length === 0 && (
          <p className="text-xs text-muted-foreground p-3 text-center">
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </p>
        )}
      </div>

      {/* Delete all / delete searched — bottom of sidebar */}
      {filteredConversations.length > 0 && (
        <div className="border-t border-sidebar-border/70 p-3">
          <BulkDeleteButton
            label={isSearchActive ? `Delete ${filteredConversations.length} searched` : 'Delete all chats'}
            onConfirm={handleDeleteBulk}
          />
        </div>
      )}
    </div>
  );
};

/** Bulk delete button with double-click confirm */
const BulkDeleteButton: FC<{ label: string; onConfirm: () => Promise<void> }> = ({ label, onConfirm }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const { armed, onClick } = useDoubleClickConfirm(async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
  });

  if (isDeleting) {
    return (
      <div className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground">
        <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
        Deleting...
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs transition-all ${
        armed
          ? 'bg-destructive text-destructive-foreground font-medium'
          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
      }`}
    >
      <Trash2Icon className="h-3.5 w-3.5" />
      {armed ? 'Click again to confirm' : label}
    </button>
  );
};
