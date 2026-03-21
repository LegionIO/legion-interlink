import { useState, useMemo, type FC } from 'react';
import { ChevronDownIcon, ChevronRightIcon, BotIcon, StopCircleIcon, Trash2Icon } from 'lucide-react';
import { useSubAgents, type SubAgentThreadState } from '@/providers/RuntimeProvider';

const statusColors: Record<string, string> = {
  running: 'bg-blue-500',
  'awaiting-input': 'bg-yellow-500',
  completed: 'bg-green-500',
  stopped: 'bg-orange-500',
  error: 'bg-destructive',
};

export const SubAgentSidebarSection: FC = () => {
  const [expanded, setExpanded] = useState(true);
  const { threads, navigateTo, stop, deleteThread } = useSubAgents();

  const threadList = useMemo(() => Array.from(threads.values()), [threads]);

  if (threadList.length === 0) return null;

  return (
    <div className="border-t shrink-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[10px] uppercase text-muted-foreground font-medium hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
        <BotIcon className="h-3 w-3" />
        Sub-agent Threads ({threadList.length})
      </button>

      {expanded && (
        <div className="space-y-0.5 px-2 pb-2 max-h-[200px] overflow-y-auto">
          {threadList.map((thread) => (
            <SubAgentSidebarEntry
              key={thread.conversationId}
              thread={thread}
              onNavigate={() => navigateTo(thread.conversationId)}
              onStop={() => stop(thread.conversationId)}
              onDelete={() => deleteThread(thread.conversationId)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SubAgentSidebarEntry: FC<{
  thread: SubAgentThreadState;
  onNavigate: () => void;
  onStop: () => void;
  onDelete: () => void;
}> = ({ thread, onNavigate, onStop, onDelete }) => {
  const isActive = thread.status === 'running' || thread.status === 'awaiting-input';
  const taskLabel = thread.task.length > 55 ? thread.task.slice(0, 52) + '...' : thread.task;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate()}
      className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-sidebar-accent/50 cursor-pointer group"
      style={{ paddingLeft: `${10 + (thread.depth ?? 0) * 8}px` }}
    >
      <BotIcon className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
      <div className="flex-1 min-w-0">
        <span className="line-clamp-2 text-[11px]">{taskLabel || 'Sub-agent'}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColors[thread.status] ?? 'bg-muted-foreground'}`} />
          <span className="text-[10px] text-muted-foreground capitalize">{thread.status}</span>
          {thread.messages.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{thread.messages.length} msgs</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {isActive && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStop(); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 transition-all"
            title="Stop sub-agent"
          >
            <StopCircleIcon className="h-3 w-3 text-destructive" />
          </button>
        )}
        {!isActive && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 transition-all"
            title="Delete thread"
          >
            <Trash2Icon className="h-3 w-3 text-muted-foreground hover:text-destructive" />
          </button>
        )}
      </div>
    </div>
  );
};
