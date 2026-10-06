import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, ApiError, loadToken, setToken, setUnauthorizedHandler, User } from '../api/client';

// offline: we have a saved token but could not reach the server, so we do not know yet.
type Status = 'loading' | 'signedOut' | 'signedIn' | 'offline';

type AuthValue = {
  status: Status;
  user: User | null;
  /** Save a token from login or register, then load the user. */
  signIn: (accessToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Check the saved token again (use it from the offline screen). */
  retry: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    await setToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      setStatus('signedIn');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // The client already signs out on 401. Make sure the state is clean.
        await setToken(null);
        setUser(null);
        setStatus('signedOut');
      } else {
        // Network or server problem: keep the token, and do not make the user log in again.
        setStatus('offline');
      }
    }
  }, []);

  const signIn = useCallback(
    async (accessToken: string) => {
      await setToken(accessToken);
      await refresh();
    },
    [refresh],
  );

  const retry = useCallback(async () => {
    setStatus('loading');
    if (await loadToken()) await refresh();
    else setStatus('signedOut');
  }, [refresh]);

  // At start: load the saved token and check it with /api/auth/me.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    void retry();
    return () => setUnauthorizedHandler(null);
  }, [retry, signOut]);

  const value = useMemo(() => ({ status, user, signIn, signOut, retry }), [status, user, signIn, signOut, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
