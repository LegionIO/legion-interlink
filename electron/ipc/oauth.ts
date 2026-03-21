import type { IpcMain } from 'electron';
import { BrowserWindow, session } from 'electron';
import { join } from 'path';
import { lookup } from 'dns/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ensureCerts } from '../utils/certs.js';

const execAsync = promisify(exec);

type TokenState = {
  token: string | null;
  expiresAt: number | null;
  sessionExpired: boolean;
};

const tokenState: TokenState = {
  token: null,
  expiresAt: null,
  sessionExpired: false,
};

// Dedicated session partition for Agent Lattice auth — persists IDP cookies
const AUTH_PARTITION = 'persist:agent-lattice-auth';
const DEFAULT_CALLBACK_HOST = 'localhost';
const DEFAULT_CALLBACK_PORT = 19876;

type OAuthRuntimeConfig = {
  agentUrl: string;
  callbackHost: string;
  callbackPort: number;
  cookieDomain?: string;
  cookieName?: string;
};

let authWindow: BrowserWindow | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString());
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp <= Math.floor(Date.now() / 1000);
}

function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return null;
  return payload.exp * 1000;
}

function getTokenTTLMs(token: string): number {
  const expiry = getTokenExpiryMs(token);
  if (!expiry) return 0;
  return Math.max(0, expiry - Date.now());
}

export function getAgentLatticeToken(): string | null {
  if (!tokenState.token) return null;
  if (isTokenExpired(tokenState.token)) {
    tokenState.token = null;
    tokenState.expiresAt = null;
    return null;
  }
  return tokenState.token;
}

/** Whether the startup silent refresh has completed (or was skipped) */
let startupCheckDone = false;

export function getAgentLatticeAuthStatus(): {
  authenticated: boolean;
  expiresAt: number | null;
  expiresInMs: number | null;
  isWarning: boolean;
  sessionExpired: boolean;
  startupCheckDone: boolean;
} {
  const token = getAgentLatticeToken();
  if (!token) {
    return { authenticated: false, expiresAt: null, expiresInMs: null, isWarning: false, sessionExpired: tokenState.sessionExpired, startupCheckDone };
  }
  const expiresAt = tokenState.expiresAt;
  const expiresInMs = expiresAt ? expiresAt - Date.now() : null;
  // Only warn if session is expired (needs re-login), not just token expiring (auto-refreshes)
  const isWarning = tokenState.sessionExpired;
  return { authenticated: true, expiresAt, expiresInMs, isWarning, sessionExpired: tokenState.sessionExpired, startupCheckDone };
}

function notifyAuthChanged(): void {
  const status = getAgentLatticeAuthStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win !== authWindow) {
      win.webContents.send('agent-lattice:auth-changed', status);
    }
  }
}

/**
 * Chromium discards session cookies (those without an expirationDate) when the
 * session ends, even for persist: partitions. IDP cookies are typically session
 * cookies, which is why silent refresh fails after a restart.
 *
 * Fix: after a successful login, re-set any session cookies with an explicit
 * expiration so they survive across app restarts.
 */
async function persistSessionCookies(): Promise<void> {
  try {
    const authSes = session.fromPartition(AUTH_PARTITION);
    const allCookies = await authSes.cookies.get({});
    // 7-day expiry — IDP sessions typically last longer, and we'll refresh before then
    const expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    let persisted = 0;

    for (const cookie of allCookies) {
      // Skip cookies that already have an expiration (they're already persisted)
      if (cookie.expirationDate) continue;

      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain?.replace(/^\./, '') || 'localhost'}${cookie.path || '/'}`;
      try {
        await authSes.cookies.set({
          url,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || undefined,
          path: cookie.path || '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite as 'unspecified' | 'no_restriction' | 'lax' | 'strict' | undefined,
          expirationDate: expiry,
        });
        persisted++;
      } catch { /* some cookies may fail due to domain restrictions — that's ok */ }
    }

    if (persisted > 0) {
      console.info(`[OAuth] Persisted ${persisted} session cookies with 7-day expiry`);
    }
  } catch (err) {
    console.warn('[OAuth] Failed to persist session cookies:', err);
  }
}

/** Cached auth cookie value for injection via webRequest */
let authCookieValue: string | null = null;

function normalizeCookieDomain(domain?: string): string | null {
  const trimmed = domain?.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/^\.+/, '');
}

function cookieDomainMatches(cookieDomain: string | undefined, targetDomain: string): boolean {
  if (!cookieDomain) return false;
  const normalizedCookieDomain = cookieDomain.replace(/^\.+/, '').toLowerCase();
  return normalizedCookieDomain === targetDomain || normalizedCookieDomain.endsWith(`.${targetDomain}`);
}

/**
 * Capture the configured auth cookie from the auth session and cache it.
 * We inject it via webRequest.onBeforeSendHeaders because the renderer runs on
 * file:// (or localhost in dev), so Chromium's SameSite policy won't attach
 * a Secure cookie to cross-origin image fetches on its own.
 */
async function bridgeAuthCookie(): Promise<void> {
  const cookieName = currentAuthConfig?.cookieName?.trim();
  const cookieDomain = normalizeCookieDomain(currentAuthConfig?.cookieDomain);
  if (!cookieName || !cookieDomain) {
    authCookieValue = null;
    return;
  }

  try {
    const authSes = session.fromPartition(AUTH_PARTITION);
    const cookies = await authSes.cookies.get({ name: cookieName });
    const matchedCookie = cookies.find((cookie) => cookieDomainMatches(cookie.domain, cookieDomain));
    if (!matchedCookie) {
      console.info(`[OAuth] No ${cookieName} cookie found for ${cookieDomain}`);
      return;
    }

    authCookieValue = matchedCookie.value;
    console.info(`[OAuth] ${cookieName} cookie captured for injection on ${cookieDomain}`);
  } catch (err) {
    console.warn('[OAuth] Failed to capture auth cookie:', err);
  }
}

/** Install a webRequest interceptor that injects the configured auth cookie on matching requests */
let webRequestInterceptorInstalled = false;

function installCookieInterceptor(): void {
  if (webRequestInterceptorInstalled) return;
  webRequestInterceptorInstalled = true;

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*/*'] },
    (details, callback) => {
      const cookieName = currentAuthConfig?.cookieName?.trim();
      const cookieDomain = normalizeCookieDomain(currentAuthConfig?.cookieDomain);
      const requestHost = (() => {
        try {
          return new URL(details.url).hostname.toLowerCase();
        } catch {
          return '';
        }
      })();

      if (authCookieValue && cookieName && cookieDomain && (requestHost === cookieDomain || requestHost.endsWith(`.${cookieDomain}`))) {
        const existing = details.requestHeaders['Cookie'] || '';
        const cookieStr = `${cookieName}=${authCookieValue}`;
        // Don't duplicate if already present
        if (!existing.includes(`${cookieName}=`)) {
          details.requestHeaders['Cookie'] = existing ? `${existing}; ${cookieStr}` : cookieStr;
        }
      }
      callback({ requestHeaders: details.requestHeaders });
    },
  );
  console.info('[OAuth] webRequest cookie interceptor installed');
}

async function handleNewToken(token: string): Promise<boolean> {
  if (!token || isTokenExpired(token)) return false;
  tokenState.token = token;
  tokenState.expiresAt = getTokenExpiryMs(token);
  tokenState.sessionExpired = false;
  notifyAuthChanged();
  scheduleTokenRefresh(token);
  // Persist IDP session cookies so they survive app restarts
  await persistSessionCookies();
  // Capture the configured auth cookie and ensure the webRequest interceptor is active
  await bridgeAuthCookie();
  if (currentAuthConfig?.cookieDomain && currentAuthConfig?.cookieName) {
    installCookieInterceptor();
  }
  return true;
}

/**
 * Schedule a silent token refresh before the current token expires.
 * Refreshes at 80% of the token's TTL, so a 1-hour token refreshes at ~48 min.
 */
function scheduleTokenRefresh(token: string): void {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }

  const ttl = getTokenTTLMs(token);
  if (ttl <= 0) return;

  // Refresh at 80% of TTL, minimum 30 seconds
  const refreshIn = Math.max(30_000, Math.floor(ttl * 0.8));
  console.info(`[OAuth] Token refresh scheduled in ${Math.round(refreshIn / 1000)}s (TTL: ${Math.round(ttl / 1000)}s)`);

  refreshTimer = setTimeout(() => {
    console.info('[OAuth] Attempting silent token refresh...');
    silentRefresh().catch((err) => {
      console.error('[OAuth] Silent refresh failed:', err);
    });
  }, refreshIn);
}

/** Current auth config, set during initiate */
let currentAuthConfig: OAuthRuntimeConfig | null = null;

/** Build the HTTPS callback URL */
function buildCallbackUrl(host: string, port: number): string {
  return `https://${host}:${port}/oauth-callback`;
}

/**
 * Silent refresh: navigate the hidden auth window to the auth initiate URL.
 * If the IDP session is still valid, the redirect chain completes automatically
 * and we get a fresh token without user interaction.
 */
async function silentRefresh(): Promise<void> {
  if (!currentAuthConfig) {
    console.warn('[OAuth] No auth config for silent refresh');
    return;
  }

  const callbackUrl = buildCallbackUrl(currentAuthConfig.callbackHost, currentAuthConfig.callbackPort);
  const state = crypto.randomUUID();
  const agentBase = currentAuthConfig.agentUrl.replace(/\/+$/, '');
  const authUrl = new URL(`${agentBase}/mesh/auth/initiate`);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('state', state);

  // Ensure auth window exists (hidden)
  ensureAuthWindow();
  if (!authWindow) return;

  return new Promise<void>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn('[OAuth] Silent refresh timed out — IDP session likely expired');
        tokenState.sessionExpired = true;
        notifyAuthChanged();
        resolve();
      }
    }, 30_000);

    // The redirect handler will catch the callback
    const handler = (_event: Electron.Event, url: string) => {
      if (!url.includes('/oauth-callback') || settled) return;
      settled = true;
      clearTimeout(timeout);

      try {
        const parsed = new URL(url);
        const token = parsed.searchParams.get('token');
        if (token) {
          handleNewToken(token).then((ok) => {
            if (ok) {
              console.info('[OAuth] Silent refresh succeeded');
            } else {
              console.warn('[OAuth] Silent refresh: no valid token in callback');
              tokenState.sessionExpired = true;
              notifyAuthChanged();
            }
            resolve();
          });
        } else {
          console.warn('[OAuth] Silent refresh: no valid token in callback');
          tokenState.sessionExpired = true;
          notifyAuthChanged();
          resolve();
        }
      } catch (err) {
        console.error('[OAuth] Silent refresh callback parse error:', err);
        resolve();
      }
    };

    authWindow!.webContents.on('will-redirect', handler);
    authWindow!.webContents.on('will-navigate', handler);

    // Navigate to trigger the auth flow
    authWindow!.loadURL(authUrl.toString()).catch(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        tokenState.sessionExpired = true;
        notifyAuthChanged();
        resolve();
      }
    });
  });
}

function ensureAuthWindow(): void {
  if (authWindow && !authWindow.isDestroyed()) return;

  authWindow = new BrowserWindow({
    width: 600,
    height: 700,
    show: false, // hidden by default for silent refresh
    webPreferences: {
      partition: AUTH_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Accept our self-signed cert for the configured callback host only
  const callbackHost = currentAuthConfig?.callbackHost ?? DEFAULT_CALLBACK_HOST;
  authWindow.webContents.on('certificate-error', (event, url, _error, _cert, callback) => {
    try {
      if (new URL(url).hostname === callbackHost) {
        event.preventDefault();
        callback(true);
        return;
      }
    } catch { /* invalid URL, fall through */ }
    callback(false);
  });

  authWindow.on('closed', () => { authWindow = null; });
}

export function registerAgentLatticeAuthHandlers(ipcMain: IpcMain, legionHome: string, getConfig?: () => Record<string, unknown>): void {
  const certsDir = join(legionHome, 'certs');

  ipcMain.handle('agent-lattice:auth-status', () => {
    return getAgentLatticeAuthStatus();
  });

  ipcMain.handle('agent-lattice:initiate-oauth', async (_event, config: {
    agentUrl: string;
    callbackHost?: string;
    callbackPort?: number;
    cookieDomain?: string;
    cookieName?: string;
  }) => {
    const callbackHost = config.callbackHost || DEFAULT_CALLBACK_HOST;
    const callbackPort = config.callbackPort || DEFAULT_CALLBACK_PORT;
    currentAuthConfig = {
      agentUrl: config.agentUrl,
      callbackHost,
      callbackPort,
      cookieDomain: config.cookieDomain?.trim() || undefined,
      cookieName: config.cookieName?.trim() || undefined,
    };

    // Ensure self-signed certs exist
    try {
      await ensureCerts(certsDir, callbackHost);
    } catch (err) {
      console.error('[OAuth] Failed to generate self-signed certs:', err);
      // Fall through — the auth flow will still work but cookies won't be captured
    }

    const callbackUrl = buildCallbackUrl(callbackHost, callbackPort);

    const state = crypto.randomUUID();
    const agentBase = config.agentUrl.replace(/\/+$/, '');
    const authUrl = new URL(`${agentBase}/mesh/auth/initiate`);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('state', state);

    ensureAuthWindow();
    if (!authWindow) {
      return { success: false, error: 'Failed to create auth window' };
    }

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          authWindow?.hide();
          resolve({ success: false, error: 'Authentication timed out after 5 minutes' });
        }
      }, 5 * 60 * 1000);

      // Intercept redirects to catch the callback URL with the token
      const redirectHandler = (_event: Electron.Event, url: string) => {
        if (!url.includes('/oauth-callback') || settled) return;
        settled = true;
        clearTimeout(timeout);

        try {
          const parsed = new URL(url);
          const token = parsed.searchParams.get('token');

          if (token) {
            handleNewToken(token).then((ok) => {
              if (ok) {
                // Show a brief success message then hide
                authWindow?.loadURL('data:text/html,<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:%231a1a2e;color:%23e0e0e0"><div style="text-align:center"><h2 style="color:%234ade80">Authenticated</h2><p>This window will close shortly.</p></div></body></html>');
                setTimeout(() => authWindow?.hide(), 1500);
                resolve({ success: true });
              } else {
                authWindow?.hide();
                resolve({ success: false, error: 'Token missing or expired in callback' });
              }
            });
          } else {
            authWindow?.hide();
            resolve({ success: false, error: 'Token missing or expired in callback' });
          }
        } catch (err) {
          authWindow?.hide();
          resolve({ success: false, error: String(err) });
        }
      };

      authWindow!.webContents.on('will-redirect', redirectHandler);
      authWindow!.webContents.on('will-navigate', redirectHandler);

      // Show the window for user interaction (login form)
      authWindow!.show();
      authWindow!.loadURL(authUrl.toString()).catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          authWindow?.hide();
          resolve({ success: false, error: `Failed to load auth URL: ${err.message}` });
        }
      });

      // Clean up redirect listeners when done
      authWindow!.once('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ success: false, error: 'Auth window closed by user' });
        }
      });
    });
  });

  ipcMain.handle('agent-lattice:set-token', async (_event, token: string) => {
    if (await handleNewToken(token)) return { success: true };
    return { success: false, error: 'Invalid or expired token' };
  });

  ipcMain.handle('agent-lattice:clear-auth', async () => {
    tokenState.token = null;
    tokenState.expiresAt = null;
    tokenState.sessionExpired = false;
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    // Clear the auth session cookies
    const ses = session.fromPartition(AUTH_PARTITION);
    ses.clearStorageData({ storages: ['cookies'] });
    // Clear the cached auth cookie (interceptor will stop injecting)
    authCookieValue = null;
    notifyAuthChanged();
    return { ok: true };
  });

  // /etc/hosts helper — check and optionally fix the configured callback host entry
  ipcMain.handle('agent-lattice:ensure-hosts', async (_event, opts?: { fix?: boolean }) => {
    const host = currentAuthConfig?.callbackHost ?? DEFAULT_CALLBACK_HOST;

    // Check if the host resolves to 127.0.0.1
    let resolved = false;
    try {
      const result = await lookup(host);
      resolved = result.address === '127.0.0.1';
    } catch { /* doesn't resolve */ }

    if (resolved) {
      return { needed: false, applied: false };
    }

    if (!opts?.fix) {
      return { needed: true, applied: false };
    }

    // Use osascript to elevate and append the /etc/hosts entry
    try {
      await execAsync(
        `osascript -e 'do shell script "grep -q \\"${host}\\" /etc/hosts || echo \\"127.0.0.1 ${host}\\" >> /etc/hosts" with administrator privileges'`
      );
      // Verify it worked
      const result = await lookup(host);
      const ok = result.address === '127.0.0.1';
      return { needed: !ok, applied: ok };
    } catch (err) {
      return { needed: true, applied: false, error: String(err) };
    }
  });

  // Attempt silent refresh on startup if Agent Lattice is enabled.
  // The persist:agent-lattice-auth partition retains IDP cookies across restarts,
  // so if the session is still valid we can get a fresh token automatically.
  // The UI gates the "not authenticated" banner on startupCheckDone so users
  // don't see a flash of the banner while this runs.
  if (getConfig) {
    (async () => {
      try {
        const config = getConfig() as {
          agentLattice?: {
            enabled: boolean;
            agentUrl: string;
            oauth?: {
              callbackHost?: string;
              callbackPort?: number;
              cookieDomain?: string;
              cookieName?: string;
            };
          };
        };
        if (!config.agentLattice?.enabled || !config.agentLattice.agentUrl) {
          startupCheckDone = true;
          notifyAuthChanged();
          return;
        }

        const oauth = config.agentLattice.oauth ?? {};
        currentAuthConfig = {
          agentUrl: config.agentLattice.agentUrl,
          callbackHost: oauth.callbackHost || DEFAULT_CALLBACK_HOST,
          callbackPort: oauth.callbackPort || DEFAULT_CALLBACK_PORT,
          cookieDomain: oauth.cookieDomain?.trim() || undefined,
          cookieName: oauth.cookieName?.trim() || undefined,
        };

        // Ensure certs exist before refresh (needed for HTTPS callback URL)
        await ensureCerts(certsDir, currentAuthConfig.callbackHost).catch(() => {});

        console.info('[OAuth] Attempting startup silent refresh...');
        await silentRefresh();
      } catch (err) {
        console.warn('[OAuth] Startup silent refresh failed:', err);
      } finally {
        startupCheckDone = true;
        notifyAuthChanged();
      }
    })();
  } else {
    startupCheckDone = true;
  }
}
