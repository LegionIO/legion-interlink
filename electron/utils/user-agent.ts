import { app, type WebContents } from 'electron';
import { release } from 'node:os';

type UserAgentVariables = Record<string, string>;

function tokeniseProductName(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'app';
}

function normalizeOsName(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return platform;
  }
}

function cleanSegment(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getBrandUserAgentVariables(): UserAgentVariables {
  const version = cleanSegment(app.getVersion?.() || __APP_VERSION);
  const platform = process.platform;

  return {
    productName: cleanSegment(__BRAND_PRODUCT_NAME),
    productToken: tokeniseProductName(__BRAND_PRODUCT_NAME),
    assistantName: cleanSegment(__BRAND_ASSISTANT_NAME),
    appSlug: cleanSegment(__BRAND_APP_SLUG),
    appId: cleanSegment(__BRAND_APP_ID),
    executableName: cleanSegment(__BRAND_EXECUTABLE_NAME),
    version,
    platform,
    osName: normalizeOsName(platform),
    osVersion: cleanSegment(release()),
    arch: cleanSegment(process.arch),
    electronVersion: cleanSegment(process.versions.electron),
    chromeVersion: cleanSegment(process.versions.chrome),
    nodeVersion: cleanSegment(process.versions.node),
    locale: cleanSegment(app.getLocale?.() || ''),
  };
}

export function renderBrandUserAgentTemplate(
  template: string,
  variables: Record<string, string> = getBrandUserAgentVariables(),
): string {
  const rendered = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => cleanSegment(variables[key] || ''));

  return rendered
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+(\/|\)|;|\])/g, '$1')
    .replace(/(\(|\[)\s+/g, '$1')
    .replace(/;\s*\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function getBrandUserAgent(): string {
  const resolved = renderBrandUserAgentTemplate(__BRAND_USER_AGENT);
  if (resolved) return resolved;
  return `${tokeniseProductName(__BRAND_PRODUCT_NAME)}/${cleanSegment(__APP_VERSION)}`;
}

export function withBrandUserAgent(headers?: HeadersInit): Record<string, string> {
  const normalized = new Headers(headers);
  if (!normalized.has('User-Agent')) {
    normalized.set('User-Agent', getBrandUserAgent());
  }
  const result: Record<string, string> = {};
  normalized.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function applyBrandUserAgent(webContents: WebContents): void {
  webContents.setUserAgent(getBrandUserAgent());
}
