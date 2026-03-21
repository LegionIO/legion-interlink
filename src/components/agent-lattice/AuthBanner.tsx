import { useEffect, useState, type FC } from 'react';
import { ShieldAlertIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { legion } from '@/lib/ipc-client';
import { useConfig } from '@/providers/ConfigProvider';

type AuthStatus = {
  authenticated: boolean;
  expiresAt: number | null;
  expiresInMs: number | null;
  isWarning: boolean;
  sessionExpired: boolean;
  startupCheckDone?: boolean;
};

export const AgentLatticeAuthBanner: FC = () => {
  const { config } = useConfig();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agentLattice = config ? (config as {
    agentLattice?: {
      enabled: boolean;
      agentUrl: string;
      oauth: {
        callbackHost?: string;
        callbackPort: number;
        cookieDomain?: string;
        cookieName?: string;
      };
    };
  }).agentLattice : null;
  const agentLatticeEnabled = agentLattice?.enabled ?? false;

  useEffect(() => {
    if (!agentLatticeEnabled) return;

    const checkAuth = async () => {
      try {
        const status = await legion.agentLattice.authStatus() as AuthStatus;
        setAuthStatus(status);
      } catch { /* IPC not ready */ }
    };

    checkAuth();
    const interval = setInterval(checkAuth, 30000);
    const unsubscribe = legion.agentLattice.onAuthChanged((status) => {
      setAuthStatus(status as AuthStatus);
      setError(null);
    });

    return () => { clearInterval(interval); unsubscribe(); };
  }, [agentLatticeEnabled]);

  if (!agentLatticeEnabled || !authStatus) return null;

  // Don't show the "not authenticated" banner until the startup silent refresh has completed
  if (!authStatus.startupCheckDone && !authStatus.authenticated) return null;

  // Authenticated + session alive + token auto-refreshing → no banner needed
  if (authStatus.authenticated && !authStatus.sessionExpired) return null;

  const handleAuth = async () => {
    if (!agentLattice) return;
    setIsAuthenticating(true);
    setError(null);
    try {
      const result = await legion.agentLattice.initiateOAuth({
        agentUrl: agentLattice.agentUrl,
        callbackHost: agentLattice.oauth.callbackHost,
        callbackPort: agentLattice.oauth.callbackPort,
        cookieDomain: agentLattice.oauth.cookieDomain,
        cookieName: agentLattice.oauth.cookieName,
      }) as { success: boolean; error?: string };
      if (!result.success && result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Session expired (needs re-login) vs not authenticated at all
  const sessionExpired = authStatus.authenticated && authStatus.sessionExpired;

  return (
    <div className="px-4 pt-2 space-y-1">
      <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${
        sessionExpired
          ? 'bg-yellow-500/10 border-yellow-500/20'
          : 'bg-destructive/10 border-destructive/20'
      }`}>
        <ShieldAlertIcon className={`h-4 w-4 shrink-0 ${
          sessionExpired ? 'text-yellow-700 dark:text-yellow-400' : 'text-destructive'
        }`} />
        <span className={`text-xs ${sessionExpired ? 'text-yellow-700 dark:text-yellow-400' : 'text-destructive'}`}>
          {sessionExpired
            ? 'Agent Lattice session expired — sign in to continue auto-refresh'
            : 'Agent Lattice authentication required'}
        </span>
        <button
          type="button"
          onClick={handleAuth}
          disabled={isAuthenticating}
          className={`ml-auto flex items-center gap-1 text-xs font-medium hover:underline disabled:opacity-50 ${
            sessionExpired ? 'text-yellow-700 dark:text-yellow-400' : 'text-destructive'
          }`}
        >
          {isAuthenticating ? (
            <><RefreshCwIcon className="h-3 w-3 animate-spin" /> Opening...</>
          ) : (
            sessionExpired ? 'Re-authenticate' : 'Sign in'
          )}
        </button>
      </div>
      {error && (
        <div className="flex items-start gap-2 border border-destructive/20 bg-destructive/5 rounded-lg px-3 py-2">
          <span className="text-[11px] text-destructive flex-1 break-all">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 p-0.5">
            <XIcon className="h-3 w-3 text-destructive" />
          </button>
        </div>
      )}
    </div>
  );
};
