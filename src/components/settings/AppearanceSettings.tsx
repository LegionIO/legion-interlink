import { useState, useEffect, type FC } from 'react';
import type { SettingsProps } from './shared';

type BackgroundStyle = 'matrix-rain' | 'gradient' | 'none';

const PRESET_HUES: Array<{ label: string; hue: number }> = [
  { label: 'Violet', hue: 292 },
  { label: 'Blue', hue: 240 },
  { label: 'Cyan', hue: 195 },
  { label: 'Teal', hue: 170 },
  { label: 'Green', hue: 145 },
  { label: 'Lime', hue: 120 },
  { label: 'Yellow', hue: 85 },
  { label: 'Orange', hue: 50 },
  { label: 'Red', hue: 25 },
  { label: 'Rose', hue: 350 },
  { label: 'Pink', hue: 330 },
  { label: 'Fuchsia', hue: 310 },
];

export const AppearanceSettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const ui = config.ui as {
    brandHue?: number;
    background?: BackgroundStyle;
    gradientText?: boolean;
  } | undefined;

  const currentHue = ui?.brandHue ?? (Number(__BRAND_THEME_HUE) || 292);
  const currentBackground = ui?.background ?? ((__BRAND_THEME_BACKGROUND as BackgroundStyle) ?? 'matrix-rain');
  const currentGradientText = ui?.gradientText ?? __BRAND_THEME_GRADIENT_TEXT !== 'false';

  const [hue, setHue] = useState(currentHue);

  // Sync local state with config
  useEffect(() => {
    setHue(currentHue);
  }, [currentHue]);

  // Live-preview hue changes on the document (committed on release)
  useEffect(() => {
    document.documentElement.style.setProperty('--brand-hue', String(hue));
  }, [hue]);

  const commitHue = (value: number) => {
    void updateConfig('ui.brandHue', value);
  };

  return (
    <div className="space-y-6 text-sm">
      <div>
        <h3 className="mb-3 text-base font-semibold">Appearance</h3>
        <p className="text-xs text-muted-foreground mb-5">
          Customize the visual identity of the app. Changes are saved to your config and applied instantly.
        </p>
      </div>

      {/* Brand Hue */}
      <div>
        <label className="text-xs font-medium block mb-2">Brand Color</label>
        <p className="text-[10px] text-muted-foreground mb-3">
          Controls the primary accent color used throughout the entire UI.
        </p>

        {/* Hue slider */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="h-8 w-8 shrink-0 rounded-lg border border-border/70"
            style={{ backgroundColor: `oklch(0.60 0.15 ${hue})` }}
          />
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={hue}
            onChange={(e) => setHue(Number(e.target.value))}
            onMouseUp={() => commitHue(hue)}
            onTouchEnd={() => commitHue(hue)}
            className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => `oklch(0.60 0.15 ${i * 30})`).join(', ')})`,
            }}
          />
          <input
            type="number"
            min={0}
            max={360}
            value={hue}
            onChange={(e) => {
              const v = Math.max(0, Math.min(360, Number(e.target.value) || 0));
              setHue(v);
              commitHue(v);
            }}
            className="w-16 rounded-lg border border-border/70 bg-card/80 px-2 py-1.5 text-xs text-center tabular-nums"
          />
        </div>

        {/* Preset swatches */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_HUES.map((preset) => (
            <button
              key={preset.hue}
              type="button"
              onClick={() => { setHue(preset.hue); commitHue(preset.hue); }}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] transition-colors ${
                Math.abs(currentHue - preset.hue) < 5
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-border/60 bg-card/60 hover:bg-muted/50'
              }`}
              title={`Hue: ${preset.hue}`}
            >
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: `oklch(0.60 0.15 ${preset.hue})` }}
              />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Background Style */}
      <div>
        <label className="text-xs font-medium block mb-2">Empty Chat Background</label>
        <p className="text-[10px] text-muted-foreground mb-3">
          The visual effect shown when a conversation has no messages yet.
        </p>
        <div className="flex gap-2">
          {(['matrix-rain', 'gradient', 'none'] as const).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => void updateConfig('ui.background', style)}
              className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                currentBackground === style
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-border/60 bg-card/60 hover:bg-muted/50'
              }`}
            >
              {style === 'matrix-rain' ? 'Matrix Rain' : style === 'gradient' ? 'Gradient' : 'None'}
            </button>
          ))}
        </div>
      </div>

      {/* Gradient Text */}
      <div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2">
          <input
            type="checkbox"
            checked={currentGradientText}
            onChange={(e) => void updateConfig('ui.gradientText', e.target.checked)}
            className="rounded"
          />
          <div>
            <span className="text-xs font-medium">Gradient Wordmark</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Show the animated gradient effect on the app wordmark. Disable for a plain text wordmark.
            </p>
          </div>
        </label>
      </div>

      {/* Reset */}
      <div className="pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={() => {
            const defaultHue = Number(__BRAND_THEME_HUE) || 292;
            setHue(defaultHue);
            void updateConfig('ui.brandHue', defaultHue);
            void updateConfig('ui.background', __BRAND_THEME_BACKGROUND || 'matrix-rain');
            void updateConfig('ui.gradientText', __BRAND_THEME_GRADIENT_TEXT !== 'false');
          }}
          className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs transition-colors hover:bg-muted/50"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};
