import { useEffect, useState, type FC } from 'react';
import { Monitor, Target, CheckCircle, Circle, Pause, AlertTriangle, Camera } from 'lucide-react';
import type { ComputerOverlayState } from '../../../shared/computer-use';

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function formatSeconds(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${seconds}s`;
}

const ScreenshotTimer: FC<{
  lastCaptureAt?: string;
  avgCycleDurationMs?: number;
}> = ({ lastCaptureAt, avgCycleDurationMs }) => {
  const now = useNow(1000);

  if (!lastCaptureAt) return null;

  const lastCaptureMs = new Date(lastCaptureAt).getTime();
  const elapsed = now - lastCaptureMs;
  const lastText = formatSeconds(elapsed);

  const hasEstimate = avgCycleDurationMs != null && avgCycleDurationMs > 0;
  const remaining = hasEstimate ? avgCycleDurationMs - elapsed : 0;
  const nextText = hasEstimate ? `~${formatSeconds(Math.max(0, remaining))}` : null;

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5">
      <Camera className="h-3 w-3 text-white/40" />
      <div className="space-y-0.5 text-[10px] leading-tight">
        <div className="text-white/50">
          Last: <span className="text-white/70">{lastText} ago</span>
        </div>
        {nextText && (
          <div className="text-white/50">
            Next: <span className="text-white/70">{nextText}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Purple circle that follows the AI cursor position on the macOS screen.
 * Includes a click ripple animation when the AI clicks.
 *
 * cursor.x/y are in Quartz logical-point coordinates (origin = top-left of
 * full display including menu bar). The overlay window may be constrained by
 * macOS to the work area (excluding menu bar + dock), so we subtract the
 * workArea offset passed from the main process.
 */
const CursorIndicator: FC<{
  cursor: NonNullable<ComputerOverlayState['cursor']>;
}> = ({ cursor }) => {
  if (!cursor.visible) return null;

  // cursor.x/y are in Quartz logical-point coordinates (origin = top-left of
  // full display). The overlay window covers the full display bounds, so we
  // use cursor.x/y directly as pixel positions.
  const left = cursor.x;
  const top = cursor.y;

  const clickedRecently = cursor.clickedAt
    ? Date.now() - new Date(cursor.clickedAt).getTime() < 800
    : false;

  return (
    <>
      {/* Outer glow ring */}
      <div
        className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-purple-400/50 shadow-[0_0_12px_4px_rgba(168,85,247,0.25)] transition-[left,top] duration-300 ease-out"
        style={{ left: `${left}px`, top: `${top}px` }}
      />
      {/* Inner filled dot */}
      <div
        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500/60 border border-purple-300/70 transition-[left,top] duration-300 ease-out"
        style={{ left: `${left}px`, top: `${top}px` }}
      />
      {/* Click ripple animation */}
      {clickedRecently && (
        <div
          className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-purple-400/60 animate-ping"
          style={{ left: `${left}px`, top: `${top}px` }}
        />
      )}
    </>
  );
};

export const OverlayContent: FC<{ state: ComputerOverlayState }> = ({ state }) => {
  const isPaused = state.status === 'paused';
  const isFailed = state.status === 'failed';

  return (
    <div className="relative h-full w-full">
      {/* Status banner at top */}
      <div className="flex w-full items-center justify-center p-3">
        <div
          className={`
            flex w-full max-w-3xl items-center gap-4 rounded-2xl px-6 py-3
            backdrop-blur-2xl
            border
            ${isPaused
              ? 'border-amber-400/40 bg-amber-950/60'
              : isFailed
                ? 'border-red-400/40 bg-red-950/60'
                : 'border-purple-400/30 bg-black/60 overlay-pulse-border'
            }
          `}
        >
          {/* Status Icon */}
          <div className="flex-shrink-0">
            {isPaused ? (
              <Pause className="h-6 w-6 text-amber-400" />
            ) : isFailed ? (
              <AlertTriangle className="h-6 w-6 text-red-400" />
            ) : (
              <Monitor className="h-6 w-6 text-purple-400 overlay-pulse-icon" />
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1 space-y-1">
            {/* Top line: model + status */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-purple-300/90 truncate">
                Being controlled by {state.modelDisplayName}
              </span>
              {isPaused && state.pauseReason && (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-300 text-[10px] font-medium uppercase tracking-wide">
                  {state.pauseReason === 'takeover' ? 'Human Takeover' : 'Paused'}
                </span>
              )}
              {isFailed && (
                <span className="rounded-full bg-red-400/20 px-2 py-0.5 text-red-300 text-[10px] font-medium uppercase tracking-wide">
                  Failed
                </span>
              )}
            </div>

            {/* Goal */}
            <div className="flex items-center gap-1.5 text-[11px] text-white/70">
              <Target className="h-3 w-3 flex-shrink-0 text-purple-400/60" />
              <span className="truncate">{state.goal}</span>
            </div>

            {/* Current subgoal */}
            {state.currentSubgoal && (
              <div className="text-[10px] text-white/50 truncate pl-[18px]">
                &rarr; {state.currentSubgoal}
              </div>
            )}
          </div>

          {/* Checkpoint indicators */}
          {state.checkpoints.length > 0 && (
            <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
              <div className="flex items-center gap-1.5">
                {state.checkpoints.slice(-5).map((cp, i) => (
                  <div key={i} title={cp.summary}>
                    {cp.complete ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-white/30" />
                    )}
                  </div>
                ))}
              </div>
              <span className="text-[9px] text-white/30">checkpoints</span>
            </div>
          )}

          {/* Screenshot timer */}
          <ScreenshotTimer
            lastCaptureAt={state.lastCaptureAt}
            avgCycleDurationMs={state.avgCycleDurationMs}
          />
        </div>
      </div>

      {/* AI cursor indicator — purple circle on screen */}
      {state.cursor?.visible && (
        <CursorIndicator cursor={state.cursor} />
      )}
    </div>
  );
};
