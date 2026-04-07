import { useEffect } from 'react';
import { useConfig } from '@/providers/ConfigProvider';

/**
 * Reads the brand hue from config (or branding defaults) and applies it as
 * `--brand-hue` on <html>. Every OKLCh color in globals.css derives from this
 * single variable, so changing it re-hues the entire UI.
 *
 * Also applies the initial hue synchronously before React hydrates (see main.tsx).
 */
export function useThemeInjector(): void {
  const { config } = useConfig();

  useEffect(() => {
    const ui = (config as Record<string, unknown> | null)?.ui as
      | { brandHue?: number; brandAccent?: string }
      | undefined;

    const hue = ui?.brandHue ?? (Number(__BRAND_THEME_HUE) || 292);

    document.documentElement.style.setProperty('--brand-hue', String(hue));
  }, [config]);
}
