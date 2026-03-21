import { useState, useEffect, useCallback, useRef, type FC, type PropsWithChildren } from 'react';
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  useThreadRuntime,
  useMessage,
  useComposerRuntime,
} from '@assistant-ui/react';
import {
  SendHorizontalIcon,
  CopyIcon,
  CheckIcon,
  RefreshCwIcon,
  StopCircleIcon,
  PaperclipIcon,
  XIcon,
  FileIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BanIcon,
  CpuIcon,
} from 'lucide-react';
import { legion } from '@/lib/ipc-client';
import { useAttachments } from '@/providers/AttachmentContext';
import { useBranchNav } from '@/providers/RuntimeProvider';
import { MarkdownText } from './MarkdownText';
import { ToolCallDisplay } from './ToolGroup';
import { SubAgentInline } from './SubAgentInline';
import { ComposerInput } from './ComposerInput';
import { SearchBar } from './SearchBar';
import { ModelSelector } from './ModelSelector';
import { ReasoningEffortSelector, type ReasoningEffort } from './ReasoningEffortSelector';
const MATRIX_GLYPHS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890@#$%^&*+-/~{[|`]}<>01';

export const Thread: FC<{
  selectedModelKey: string | null;
  onSelectModel: (key: string) => void;
  reasoningEffort: ReasoningEffort;
  onChangeReasoningEffort: (value: ReasoningEffort) => void;
}> = ({ selectedModelKey, onSelectModel, reasoningEffort, onChangeReasoningEffort }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Listen for Cmd+F
  useEffect(() => {
    if (!window.legion?.onFind) return;
    const cleanup = window.legion.onFind(() => setSearchOpen(true));
    return cleanup;
  }, []);

  return (
    <ThreadPrimitive.Root className="flex h-full flex-col">
      <SearchBar visible={searchOpen} onClose={() => setSearchOpen(false)} viewportRef={viewportRef} />
      <ThreadPrimitive.Viewport ref={viewportRef} className="relative flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <MatrixRainBackground />
        </ThreadPrimitive.Empty>
        <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 pt-8">
          <ThreadWelcome />
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />

          <div className="min-h-8" />
        </div>
      </ThreadPrimitive.Viewport>
      <Composer
        selectedModelKey={selectedModelKey}
        onSelectModel={onSelectModel}
        reasoningEffort={reasoningEffort}
        onChangeReasoningEffort={onChangeReasoningEffort}
      />
    </ThreadPrimitive.Root>
  );
};

const ThreadWelcome: FC = () => {
  const threadRuntime = useThreadRuntime();

  const handleSuggestion = useCallback((text: string) => {
    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text }],
    });
  }, [threadRuntime]);

  return (
    <ThreadPrimitive.Empty>
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="relative z-10 flex select-none flex-col items-center justify-center">
          <div className="mb-3 inline-flex items-center gap-0.5 text-4xl font-semibold">
            <span className="legion-gradient-text legion-wordmark">AITHENA</span>
            <CpuIcon className="h-9 w-9 text-primary/80" />
          </div>
          <p className="max-w-xl text-center text-sm text-muted-foreground">
            Your local neural workspace for coding, tooling, and system automation.
          </p>
          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3">
            {['List files in my home directory', 'Search for TODO comments in my code', 'Help me write a shell script', 'Explain a file in my project'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSuggestion(s)}
                className="rounded-2xl border border-border/70 bg-card/45 px-4 py-3 text-left text-xs transition-colors hover:bg-accent/70"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
};

const MatrixRainBackground: FC = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 overflow-hidden"
  >
    <canvas ref={useMatrixCanvas()} className="absolute inset-0 h-full w-full opacity-45" />
    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background via-background/70 to-transparent" />
    <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background via-background/75 to-transparent" />
    <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-background via-background/85 to-transparent" />
    <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-background via-background/85 to-transparent" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(160,154,232,0.08),transparent_58%)]" />
  </div>
);

function useMatrixCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let frameId = 0;
    let animationFrame = 0;
    let drops: number[] = [];
    let columnCount = 0;
    const fontSize = 14;

    const setup = () => {
      const parent = canvas.parentElement;
      const width = parent?.clientWidth ?? window.innerWidth;
      const height = parent?.clientHeight ?? window.innerHeight;
      const devicePixelRatio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * devicePixelRatio);
      canvas.height = Math.floor(height * devicePixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(devicePixelRatio, devicePixelRatio);

      columnCount = Math.ceil(width / fontSize);
      drops = Array.from({ length: columnCount }, () => 1);
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const styles = getComputedStyle(document.documentElement);

      context.fillStyle = styles.getPropertyValue('--legion-matrix-fade').trim() || 'rgba(10, 8, 18, 0.08)';
      context.fillRect(0, 0, width, height);

      context.fillStyle = styles.getPropertyValue('--legion-matrix-glyph').trim() || 'rgba(197, 194, 245, 0.7)';
      context.font = `${fontSize}px Monaco, "Cascadia Code", monospace`;

      for (let index = 0; index < drops.length; index += 1) {
        const glyph = MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)];
        const x = index * fontSize;
        const y = drops[index] * fontSize;

        context.fillText(glyph, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[index] = 0;
        }

        drops[index] += 1;
      }

      frameId = window.setTimeout(() => {
        animationFrame = window.requestAnimationFrame(draw);
      }, 65);
    };

    setup();
    draw();

    const handleResize = () => {
      window.clearTimeout(frameId);
      window.cancelAnimationFrame(animationFrame);
      setup();
      draw();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.clearTimeout(frameId);
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return canvasRef;
}

const UserMessage: FC = () => {
  const message = useMessage();
  return (
    <MessagePrimitive.Root className="group mb-6 flex justify-end">
      <div className="max-w-[72%]">
        <div
          className="rounded-[1.6rem] border px-5 py-3 text-foreground backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.22),var(--legion-user-bubble-shadow)]"
          style={{
            backgroundColor: 'var(--legion-user-bubble)',
            borderColor: 'var(--legion-user-bubble-border)',
          }}
        >
          <MessagePrimitive.Content components={userContentComponents} />
        </div>
        <div className="flex items-center justify-end gap-1">
          <ActionBarPrimitive.Root className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton />
          </ActionBarPrimitive.Root>
          <MessageTimestamp date={message.createdAt} align="right" />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const UserImagePart: FC<{ image: string }> = ({ image }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setPreviewOpen(true)} className="block my-1">
        <img
          src={image}
          alt="Attached"
          className="max-w-[25vw] max-h-[200px] rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
        />
      </button>
      {previewOpen && <FilePreviewModal src={image} onClose={() => setPreviewOpen(false)} />}
    </>
  );
};

const UserFilePart: FC<{ data?: string; mimeType?: string; filename?: string; file?: unknown }> = (props) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const filename = props.filename ?? 'file';
  const mimeType = props.mimeType ?? '';
  const data = props.data ?? '';
  const isPdf = mimeType === 'application/pdf';
  const isPreviewable = isPdf || mimeType.startsWith('image/');

  const ext = filename.split('.').pop()?.toUpperCase() ?? 'FILE';
  const iconColors: Record<string, string> = {
    PDF: 'bg-red-500/20 text-red-400',
    JSON: 'bg-yellow-500/20 text-yellow-400',
    MD: 'bg-blue-500/20 text-blue-400',
    TS: 'bg-blue-600/20 text-blue-300',
    TSX: 'bg-blue-600/20 text-blue-300',
    JS: 'bg-yellow-400/20 text-yellow-300',
    PY: 'bg-green-500/20 text-green-400',
    CSV: 'bg-emerald-500/20 text-emerald-400',
    TXT: 'bg-gray-500/20 text-gray-400',
  };
  const badgeClass = iconColors[ext] ?? 'bg-gray-500/20 text-gray-400';

  return (
    <>
      <button
        type="button"
        onClick={() => isPreviewable && data && setPreviewOpen(true)}
        className={`flex items-center gap-2.5 my-1.5 rounded-lg border px-3 py-2 text-left transition-colors ${isPreviewable ? 'cursor-pointer' : 'cursor-default'}`}
        style={{
          backgroundColor: 'var(--legion-file-chip)',
          borderColor: 'var(--legion-user-bubble-border)',
        }}
        onMouseEnter={(event) => {
          if (isPreviewable) event.currentTarget.style.backgroundColor = 'var(--legion-file-chip-hover)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = 'var(--legion-file-chip)';
        }}
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-md text-[10px] font-bold ${badgeClass}`}>
          {ext}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium truncate max-w-[200px]">{filename}</span>
          <span className="text-[10px] opacity-60">{mimeType}</span>
        </div>
        {isPreviewable && (
          <span className="text-[10px] opacity-50 ml-auto shrink-0">Click to preview</span>
        )}
      </button>
      {previewOpen && data && <FilePreviewModal src={data} onClose={() => setPreviewOpen(false)} />}
    </>
  );
};

const FilePreviewModal: FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="File preview"
    >
      <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 border border-neutral-600 shadow-xl hover:bg-neutral-600 active:bg-neutral-500 cursor-pointer select-none transition-colors"
        >
          <XIcon className="h-5 w-5 text-white pointer-events-none" />
        </button>
        {src.startsWith('data:application/pdf') ? (
          <iframe src={src} className="w-[80vw] h-[85vh] rounded-lg bg-white" title="PDF preview" />
        ) : (
          <img src={src} alt="Preview" className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain" />
        )}
      </div>
    </div>
  );
};

/**
 * ToolFallback receives props directly from assistant-ui:
 * { toolCallId, toolName, args, argsText, result, isError, addResult, resume, ... }
 */
const ToolFallback: FC<{
  toolCallId: string;
  toolName: string;
  args: unknown;
  argsText?: string;
  result?: unknown;
  isError?: boolean;
  startedAt?: string;
  finishedAt?: string;
  liveOutput?: {
    stdout?: string;
    stderr?: string;
    truncated?: boolean;
    stopped?: boolean;
  };
}> = (props) => {
  // Render sub-agent tool calls with the specialized component
  if (props.toolName === 'sub_agent') {
    return (
      <div className="my-1">
        <SubAgentInline
          toolCallId={props.toolCallId}
          args={props.args}
          result={props.result}
          isError={props.isError}
          liveOutput={props.liveOutput}
        />
      </div>
    );
  }

  return (
    <div className="my-1">
      <ToolCallDisplay
        part={{
          type: 'tool-call',
          toolCallId: props.toolCallId ?? `tc-${Date.now()}`,
          toolName: props.toolName ?? 'unknown',
          args: props.args ?? {},
          argsText: props.argsText ?? JSON.stringify(props.args, null, 2),
          result: props.result,
          isError: props.isError,
          startedAt: props.startedAt,
          finishedAt: props.finishedAt,
          liveOutput: props.liveOutput,
        }}
      />
    </div>
  );
};

/** Wraps consecutive tool calls with a divider above */
const ToolGroupWrapper: FC<PropsWithChildren> = ({ children }) => (
  <div className="my-2 border-t border-border/40 pt-2 space-y-1.5">
    {children}
  </div>
);

/* ── Hoisted components for MessagePrimitive.Content (stable refs prevent remounting) ── */

const UserTextPart: FC<{ text: string }> = ({ text }) => {
  if (text.startsWith('\n\n--- File:') || text.startsWith('\n[Attached file:')) return null;
  return <span className="whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</span>;
};

const userContentComponents = {
  Text: UserTextPart,
  Image: UserImagePart,
  File: UserFilePart,
};

const AssistantTextPart: FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  return <div className="py-0.5"><MarkdownText text={text} /></div>;
};

const assistantContentComponents = {
  Text: AssistantTextPart,
  tools: {
    Fallback: ToolFallback,
  },
  ToolGroup: ToolGroupWrapper,
};

const AssistantMessage: FC = () => {
  const message = useMessage();
  const isRunning = message.status?.type === 'running';
  const content = message.content ?? [];
  const hasContent = content.some((p: { type: string; text?: string }) =>
    p.type === 'tool-call' || (p.type === 'text' && p.text?.trim()),
  );
  const isEmpty = !isRunning && !hasContent;

  return (
    <MessagePrimitive.Root className="group mb-8 flex justify-start">
      <div className="w-full max-w-4xl">
        <div className="aui-assistant-content rounded-[1.5rem] border border-border/45 bg-card/[0.22] px-4 py-3 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-[2px]">
          {isEmpty ? (
            <div className="flex items-center gap-2 py-0.5 text-muted-foreground">
              <BanIcon className="h-3.5 w-3.5" />
              <span className="text-xs italic">Response cancelled</span>
            </div>
          ) : (
            <>
              <MessagePrimitive.Content components={assistantContentComponents} />
              {/* Typing dots: visible inside assistant bubble, hidden by CSS once content parts render */}
              <div className="aui-typing-dots">
                <div className="flex items-center gap-1.5 py-0.5">
                  <div className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0ms]" />
                  <div className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:150ms]" />
                  <div className="h-2 w-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <MessageTimestamp date={message.createdAt} align="left" />
          <AssistantActionBar />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => (
  <ActionBarPrimitive.Root className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
    <CopyButton />
    <ActionBarPrimitive.Reload asChild>
      <button type="button" className="flex h-7 w-7 items-center justify-center rounded-xl hover:bg-muted transition-colors" title="Regenerate">
        <RefreshCwIcon className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </ActionBarPrimitive.Reload>

    <BranchPicker />
  </ActionBarPrimitive.Root>
);

/** Custom branch picker using our tree-based branching */
const BranchPicker: FC = () => {
  const nav = useBranchNav();
  if (!nav || nav.total <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 ml-1">
      <button
        type="button"
        onClick={nav.goToPrevious}
        disabled={nav.current <= 1}
        className="flex h-7 w-7 items-center justify-center rounded-xl hover:bg-muted transition-colors disabled:opacity-30"
        title="Previous variant"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <span className="text-[10px] text-muted-foreground tabular-nums min-w-[2rem] text-center">
        {nav.current} / {nav.total}
      </span>
      <button
        type="button"
        onClick={nav.goToNext}
        disabled={nav.current >= nav.total}
        className="flex h-7 w-7 items-center justify-center rounded-xl hover:bg-muted transition-colors disabled:opacity-30"
        title="Next variant"
      >
        <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
};

const CopyButton: FC = () => {
  const [copied, setCopied] = useState(false);
  return (
    <ActionBarPrimitive.Copy asChild copiedDuration={2000} onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      <button type="button" className="flex h-7 w-7 items-center justify-center rounded-xl hover:bg-muted transition-colors" title="Copy">
        {copied ? <CheckIcon className="h-3.5 w-3.5 text-green-500" /> : <CopyIcon className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    </ActionBarPrimitive.Copy>
  );
};

const MessageTimestamp: FC<{ date?: Date; align: 'left' | 'right' }> = ({ date, align }) => {
  if (!date) return null;
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let label: string;
  if (isToday) {
    label = time;
  } else if (isYesterday) {
    label = `Yesterday ${time}`;
  } else {
    label = `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }

  return (
    <div className={`text-[10px] text-muted-foreground/60 mt-0.5 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {label}
    </div>
  );
};

/** Stop generation without restoring composer text (unlike ComposerPrimitive.Cancel which restores draft) */
const StopButton: FC = () => {
  const threadRuntime = useThreadRuntime();
  const composerRuntime = useComposerRuntime();
  return (
    <button
      type="button"
      onClick={() => {
        threadRuntime.cancelRun();
        // Force-clear the composer so it doesn't restore the previous message text
        composerRuntime.setText('');
      }}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
    >
      <StopCircleIcon className="h-4 w-4" />
    </button>
  );
};

const Composer: FC<{
  selectedModelKey: string | null;
  onSelectModel: (key: string) => void;
  reasoningEffort: ReasoningEffort;
  onChangeReasoningEffort: (value: ReasoningEffort) => void;
}> = ({ selectedModelKey, onSelectModel, reasoningEffort, onChangeReasoningEffort }) => {
  const { attachments, addAttachments, removeAttachment } = useAttachments();

  const handleAttach = async () => {
    try {
      const result = await legion.dialog.openFile() as { canceled: boolean; files?: Array<{ name: string; mime: string; isImage: boolean; size: number; dataUrl: string; text?: string }> };
      if (!result.canceled && result.files) addAttachments(result.files);
    } catch (err) { console.error('Attach failed:', err); }
  };

  return (
    <div className="relative z-20 border-t border-border/70 bg-background/88 px-6 pb-6 pt-4 backdrop-blur-md">
      <div className="mx-auto w-full max-w-5xl">
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((file, i) => (
            <div key={`${file.name}-${i}`} className="flex items-center gap-1.5 rounded-2xl border border-border/70 bg-card/65 px-2.5 py-2 text-xs group/att">
              {file.isImage ? (
                <img src={file.dataUrl} alt={file.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <FileIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex flex-col">
                <span className="max-w-[120px] truncate font-medium">{file.name}</span>
                <span className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="p-0.5 rounded hover:bg-destructive/10 opacity-0 group-hover/att:opacity-100 transition-opacity ml-1"
              >
                <XIcon className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ComposerPrimitive.Root className="flex flex-col gap-0 rounded-[1.7rem] border border-border/70 bg-card/78 px-3 py-3 shadow-[inset_0_0_0_1px_rgba(197,194,245,0.08),0_12px_40px_rgba(5,4,15,0.18)]">
        <ComposerInput
          placeholder="Message Aithena..."
          className="min-h-[48px] max-h-[220px] w-full overflow-y-auto px-1 py-0.5 text-[15px]"
          autoFocus
        />
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={handleAttach} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card/70 transition-colors hover:bg-muted/50" title="Attach file">
              <PaperclipIcon className="h-4 w-4 text-muted-foreground" />
            </button>
            <ModelSelector
              selectedModelKey={selectedModelKey}
              onSelectModel={onSelectModel}
            />
            <ReasoningEffortSelector
              value={reasoningEffort}
              onChange={onChangeReasoningEffort}
            />
          </div>
          <ThreadPrimitive.If running={false}>
            <ComposerPrimitive.Send asChild>
              <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40">
                <SendHorizontalIcon className="h-4 w-4" />
              </button>
            </ComposerPrimitive.Send>
          </ThreadPrimitive.If>
          <ThreadPrimitive.If running>
            <StopButton />
          </ThreadPrimitive.If>
        </div>
      </ComposerPrimitive.Root>
      </div>
    </div>
  );
};
