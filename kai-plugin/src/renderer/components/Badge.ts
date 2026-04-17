/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { cx } from '../lib/utils.js';

const palette: Record<string, string> = {
  online: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  offline: 'bg-red-500/10 text-red-700 dark:text-red-300',
  checking: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  unconfigured: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  disabled: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  error: 'bg-red-500/10 text-red-700 dark:text-red-300',
  pending: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  running: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  'needs-input': 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  resolved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-300',
  unknown: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

export function Badge({ status }: { status: string }): any {
  const label = status || 'unknown';
  return h(
    'span',
    {
      className: cx(
        'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
        palette[label] || palette.unknown,
      ),
    },
    label,
  );
}
