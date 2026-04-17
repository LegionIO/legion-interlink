/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { cx } from '../lib/utils.js';
import { fmtUptime } from '../lib/utils.js';

// ---------------------------------------------------------------------------
// Status dot color mapping
// ---------------------------------------------------------------------------

const dotColors: Record<string, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-red-500',
  unconfigured: 'bg-amber-500',
  checking: 'bg-blue-500',
  disabled: 'bg-slate-400',
};

const statusLabels: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  unconfigured: 'Not configured',
  checking: 'Checking',
  disabled: 'Disabled',
};

// ---------------------------------------------------------------------------
// LegionStatusBanner
// ---------------------------------------------------------------------------

type BannerProps = {
  props: {
    status?: string;
    gaiaMode?: string;
    uptime?: number;
    workerCount?: number;
    unreadNotifications?: number;
    serviceUrl?: string;
  };
  pluginState?: Record<string, any>;
  onAction?: (action: string, data?: Record<string, unknown>) => void;
};

export function LegionStatusBanner({ props, onAction }: BannerProps): any {
  const status = props.status || 'offline';
  const gaiaMode = props.gaiaMode || '';
  const uptime = props.uptime;
  const workerCount = props.workerCount ?? 0;
  const unread = props.unreadNotifications ?? 0;
  const isOnline = status === 'online';

  const dotColor = dotColors[status] || dotColors.disabled;
  const statusText = statusLabels[status] || status;

  return h(
    'div',
    {
      className: cx(
        'flex items-center gap-3 px-3 py-1.5 text-xs font-medium',
        'rounded-lg border border-border/50 bg-card/60',
        'min-h-[36px]',
      ),
    },

    // --- Left: Status dot + Legion label + status ---
    h(
      'div',
      { className: 'flex items-center gap-2 shrink-0' },
      h('span', {
        className: cx(
          'inline-block h-2 w-2 rounded-full shrink-0',
          dotColor,
          isOnline && 'animate-pulse',
        ),
      }),
      h('span', { className: 'font-semibold text-foreground' }, 'Legion'),
      h(
        'span',
        { className: 'text-muted-foreground' },
        statusText,
      ),
    ),

    // --- Middle: badges ---
    h(
      'div',
      { className: 'flex items-center gap-2 ml-auto' },

      // GAIA mode badge
      gaiaMode
        ? h(
            'span',
            {
              className: cx(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                'bg-violet-500/10 text-violet-700 dark:text-violet-300',
              ),
            },
            `GAIA ${gaiaMode}`,
          )
        : null,

      // Uptime
      isOnline && uptime != null
        ? h(
            'span',
            { className: 'text-muted-foreground' },
            fmtUptime(uptime),
          )
        : null,

      // Worker count
      isOnline
        ? h(
            'span',
            {
              className: cx(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                workerCount > 0
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
              ),
            },
            `${workerCount} worker${workerCount !== 1 ? 's' : ''}`,
          )
        : null,

      // Unread notifications
      unread > 0
        ? h(
            'span',
            {
              className: cx(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                'bg-amber-500/10 text-amber-700 dark:text-amber-300',
              ),
            },
            `${unread} unread`,
          )
        : null,
    ),

    // --- Right: quick-action links ---
    h(
      'div',
      { className: 'flex items-center gap-2 shrink-0 ml-2' },
      h(
        'button',
        {
          type: 'button',
          className: cx(
            'text-[11px] font-medium text-primary hover:underline cursor-pointer',
            'bg-transparent border-0 p-0',
          ),
          onClick: () => {
            // Fire both: IPC action + DOM event for immediate navigation
            onAction?.('open-panel', { panelId: 'dashboard' });
            window.dispatchEvent(new CustomEvent('plugin-navigate', {
              detail: { pluginName: 'legion', target: { type: 'panel', panelId: 'dashboard' } },
            }));
          },
        },
        'Dashboard',
      ),
      h(
        'button',
        {
          type: 'button',
          className: cx(
            'text-[11px] font-medium text-primary hover:underline cursor-pointer',
            'bg-transparent border-0 p-0',
          ),
          onClick: () => {
            onAction?.('open-proactive-thread');
            window.dispatchEvent(new CustomEvent('plugin-navigate', {
              detail: { pluginName: 'legion', target: { type: 'conversation', conversationId: '__legion_proactive__' } },
            }));
          },
        },
        'GAIA',
      ),
    ),
  );
}
