import { useState, useCallback, useRef, useEffect, type FC } from 'react';
import {
  ArrowLeftIcon,
  SendHorizontalIcon,
  StopCircleIcon,
  BotIcon,
  UserIcon,
  MonitorIcon,
} from 'lucide-react';
import { useSubAgents } from '@/providers/RuntimeProvider';
import { MarkdownText } from './MarkdownText';
import { ToolCallDisplay } from './ToolGroup';
import { RichChatInput } from './RichChatInput';
import { UserCodeMarkdown } from './UserCodeMarkdown';

type SubAgentThreadProps = {
  subAgentConversationId: string;
  onBack: () => void;
};

export const SubAgentThread: FC<SubAgentThreadProps> = ({ subAgentConversationId, onBack }) => {
  const [messageInput, setMessageInput] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);
  const { threads, sendMessage, stop } = useSubAgents();

  const thread = threads.get(subAgentConversationId);
  const isRunning = thread?.status === 'running' || thread?.status === 'awaiting-input';

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [thread?.messages.length]);

  const handleSend = useCallback(async () => {
    if (!messageInput.trim()) return;
    await sendMessage(subAgentConversationId, messageInput.trim());
    setMessageInput('');
  }, [subAgentConversationId, messageInput, sendMessage]);

  const handleStop = useCallback(async () => {
    await stop(subAgentConversationId);
  }, [subAgentConversationId, stop]);

  if (!thread) {
    return (
      <div className="flex h-full flex-col">
        <Header task="Sub-agent thread not found" status="error" onBack={onBack} />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          This sub-agent thread is no longer available.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        task={thread.task}
        status={thread.status}
        depth={thread.depth}
        onBack={onBack}
        onStop={isRunning ? handleStop : undefined}
      />

      {/* Messages */}
      <div ref={viewportRef} className="flex-1 overflow-y-auto px-4 pt-4">
        {thread.messages.map((msg, i) => {
          const content = Array.isArray(msg.content) ? msg.content : [];
          const role = msg.role as string;
          return (
            <div key={(msg as { id?: string }).id ?? i} className="mb-3">
              <ChatBubble role={role} content={content} />
            </div>
          );
        })}

        {/* Typing indicator */}
        {isRunning && (
          <div className="flex items-center gap-2 mb-3 pl-7">
            <BotIcon className="h-4 w-4 text-blue-400" />
            <div className="flex items-center gap-1.5 rounded-2xl bg-muted/80 px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div className="min-h-8" />
      </div>

      {/* Composer — always visible so user can resume conversation after completion */}
      <div className="border-t p-4">
        <div className="flex items-end gap-2 rounded-2xl border bg-card px-3 py-2 shadow-sm">
          <RichChatInput
            value={messageInput}
            onChange={setMessageInput}
            onSubmit={handleSend}
            placeholder={isRunning ? 'Message sub-agent...' : 'Resume conversation with sub-agent...'}
            className="min-h-[36px] max-h-[180px] flex-1 py-1.5 text-sm bg-transparent outline-none"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!messageInput.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-colors shrink-0"
          >
            <SendHorizontalIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Header ---

const Header: FC<{
  task: string;
  status: string;
  depth?: number;
  onBack: () => void;
  onStop?: () => void;
}> = ({ task, status, depth, onBack, onStop }) => {
  const statusColors: Record<string, string> = {
    running: 'bg-blue-500',
    'awaiting-input': 'bg-yellow-500',
    completed: 'bg-green-500',
    stopped: 'bg-orange-500',
    error: 'bg-destructive',
  };

  return (
    <div className="border-b px-4 py-3 flex items-center gap-3">
      <button type="button" onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0" title="Back to parent thread">
        <ArrowLeftIcon className="h-4 w-4" />
      </button>
      <BotIcon className="h-4 w-4 text-blue-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{task.length > 80 ? task.slice(0, 77) + '...' : task}</div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColors[status] ?? 'bg-muted-foreground'}`} />
          <span className="capitalize">{status}</span>
          {depth !== undefined && depth > 0 && <span>Depth {depth}</span>}
        </div>
      </div>
      {onStop && (
        <button type="button" onClick={onStop} className="flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-md transition-colors shrink-0">
          <StopCircleIcon className="h-3.5 w-3.5" />
          Stop
        </button>
      )}
    </div>
  );
};

// --- Chat bubble (full-size version for the thread view) ---

type ContentPart = {
  type: string;
  text?: string;
  source?: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  argsText?: string;
  result?: unknown;
  isError?: boolean;
  startedAt?: string;
  finishedAt?: string;
  liveOutput?: { stdout?: string; stderr?: string; truncated?: boolean; stopped?: boolean };
};

const ChatBubble: FC<{ role: string; content: ContentPart[] }> = ({ role, content }) => {
  const isAssistant = role === 'assistant';

  // Determine user message source
  const firstTextPart = content.find((p) => p.type === 'text');
  const source = (firstTextPart as { source?: string } | undefined)?.source;

  let label: string;
  let Icon: typeof BotIcon;
  let iconColor: string;
  let bubbleBg: string;
  let align: string;

  if (isAssistant) {
    label = 'Sub-agent';
    Icon = BotIcon;
    iconColor = 'text-blue-400';
    bubbleBg = 'bg-muted';
    align = 'justify-start';
  } else if (source === 'task') {
    label = 'Task (from parent agent)';
    Icon = MonitorIcon;
    iconColor = 'text-primary';
    bubbleBg = 'bg-[var(--brand-accent-subtle)] border border-[var(--brand-accent-border)]';
    align = 'justify-start';
  } else if (source === 'user') {
    label = 'You (direct message)';
    Icon = UserIcon;
    iconColor = 'text-primary';
    bubbleBg = 'bg-primary text-primary-foreground';
    align = 'justify-end';
  } else {
    label = 'Parent agent';
    Icon = MonitorIcon;
    iconColor = 'text-orange-400';
    bubbleBg = 'bg-orange-500/10 border border-orange-500/20';
    align = 'justify-start';
  }

  const hasText = content.some((p) => p.type === 'text' && p.text?.trim());
  const hasToolCalls = content.some((p) => p.type === 'tool-call');
  if (!hasText && !hasToolCalls) return null;

  return (
    <div className={`flex gap-2.5 ${align}`}>
      {align === 'justify-start' && <Icon className={`h-4 w-4 mt-2.5 shrink-0 ${iconColor}`} />}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${bubbleBg}`}>
        <span className="text-[10px] uppercase text-muted-foreground/70 font-medium block mb-0.5">{label}</span>
        <div className="space-y-1">
          {content.map((part, i) => {
            if (part.type === 'text' && part.text?.trim()) {
              return (
                <div key={i} className="text-sm">
                  {source === 'user'
                    ? <UserCodeMarkdown text={part.text} className="text-sm" />
                    : <MarkdownText text={part.text} />}
                </div>
              );
            }
            if (part.type === 'tool-call') {
              return (
                <div key={part.toolCallId ?? i} className="my-1">
                  <ToolCallDisplay
                    part={{
                      type: 'tool-call',
                      toolCallId: part.toolCallId ?? `tc-${i}`,
                      toolName: part.toolName ?? 'unknown',
                      args: part.args ?? {},
                      argsText: part.argsText ?? JSON.stringify(part.args, null, 2),
                      result: part.result,
                      isError: part.isError,
                      startedAt: part.startedAt,
                      finishedAt: part.finishedAt,
                      liveOutput: part.liveOutput,
                    }}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
      {align === 'justify-end' && <Icon className={`h-4 w-4 mt-2.5 shrink-0 ${iconColor}`} />}
    </div>
  );
};
