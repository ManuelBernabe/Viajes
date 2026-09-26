import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cachedEmail, checkSession, login, logout, register, type SignUpWith } from '../auth/session';
import { sessionRenewed, startSyncLoop, useSyncStatus } from '../data/syncClient';

export interface Session {
  status: 'loading' | 'in' | 'out';
  email: string | null;
  /** No se pudo comprobar la sesión con el servidor (sin red). */
  unverified: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, with_: SignUpWith): Promise<void>;
  signOut(): Promise<void>;
}

const SessionCtx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const sync = useSyncStatus();

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await cachedEmail();
      if (cached && alive) {
        // Con sesión guardada la app abre al instante, también sin red; el servidor se consulta detrás.
        setEmail(cached);
        setStatus('in');
      }
      const check = await checkSession();
      if (!alive) {
        return;
      }
      if (check.status === 'in') {
        setEmail(check.email);
        setStatus('in');
        setUnverified(false);
      } else if (check.status === 'out') {
        setStatus('out');
        setUnverified(false);
      } else {
        setUnverified(true);
        setStatus(cached ? 'in' : 'out');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (sync.sessionExpired) {
      setStatus('out');
    }
  }, [sync.sessionExpired]);

  useEffect(() => {
    if (status !== 'in') {
      return;
    }
    return startSyncLoop();
  }, [status]);

  const signIn = useCallback(async (user: string, password: string) => {
    const me = await login(user, password);
    sessionRenewed();
    setEmail(me);
    setUnverified(false);
    setStatus('in');
  }, []);

  const signUp = useCallback(async (user: string, password: string, with_: SignUpWith) => {
    const me = await register(user, password, with_);
    sessionRenewed();
    setEmail(me);
    setUnverified(false);
    setStatus('in');
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setEmail(null);
    setStatus('out');
  }, []);

  const value = useMemo<Session>(
    () => ({ status, email, unverified, signIn, signUp, signOut }),
    [status, email, unverified, signIn, signUp, signOut],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionCtx);
  if (!session) {
    throw new Error('useSession fuera de SessionProvider');
  }
  return session;
}
