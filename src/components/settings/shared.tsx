import type { FC } from 'react';

export type SettingsProps = {
  config: Record<string, unknown>;
  updateConfig: (path: string, value: unknown) => Promise<void>;
};

export const settingsSelectClass = 'legion-settings-select w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none';

export const Toggle: FC<{ label: string; checked: boolean; onChange: (value: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
    <span className="text-xs">{label}</span>
  </label>
);

export const NumberField: FC<{ label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }> = ({ label, value, onChange, min, max }) => (
  <div>
    <label className="text-[10px] text-muted-foreground block mb-0.5">{label}</label>
    <input
      type="number"
      className="w-full rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-xs outline-none"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
    />
  </div>
);

/** Format a head/tail ratio (0–1) as "70% head, 30% tail" */
export function headTailLabel(prefix: string, ratio: number): string {
  const head = Math.round(ratio * 100);
  const tail = 100 - head;
  if (tail === 0) return `${prefix}: 100% head`;
  if (head === 0) return `${prefix}: 100% tail`;
  return `${prefix}: ${head}% head, ${tail}% tail`;
}

export const SliderField: FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }> = ({ label, value, min, max, step, onChange }) => (
  <div>
    <label className="text-[10px] text-muted-foreground block mb-0.5">{label}</label>
    <input
      type="range"
      className="w-full accent-[var(--color-primary)]"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </div>
);
