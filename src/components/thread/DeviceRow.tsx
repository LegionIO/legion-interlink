import { type FC } from 'react';
import { CheckIcon as CheckSmallIcon } from 'lucide-react';

export const DeviceRow: FC<{
  label: string;
  selected: boolean;
  level: number;
  onClick: () => void;
}> = ({ label, selected, level, onClick }) => {
  const pct = Math.min(100, Math.round(level * 500));
  const barColor = pct > 60 ? '#22c55e' : pct > 20 ? '#eab308' : '#6b7280';

  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors ${
        selected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/60 text-foreground'
      }`}
      onClick={onClick}
    >
      {selected && <CheckSmallIcon className="h-3 w-3 shrink-0" />}
      <span className="flex-1 min-w-0 truncate text-left">{label}</span>
      {/* Inline level bar */}
      <div className="w-16 h-1.5 rounded-full bg-muted/50 overflow-hidden shrink-0">
        <div
          className="h-full rounded-full transition-all duration-75"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </button>
  );
};
