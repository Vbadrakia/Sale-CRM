import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authApi } from '@/api/services';
import { ApiRequestError, AUTH_INVALIDATION_CODES, setUnauthorizedHandler, tokenStore } from '@/api/client';
import type { User } from '@/types';

export type SessionState = 'UNKNOWN' | 'CHECKING' | 'AUTHENTICATED' | 'TRANSIENT_ERROR' | 'INVALID' | 'SIGNED_OUT';

export type SessionInvalidationReason =
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_DELETED'
  | 'USER_SIGNED_OUT';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  sessionState: SessionState;
  sessionError: string | null;
  isAdmin: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
  retrySession: () => Promise<void>;
  invalidateSession: (reason: SessionInvalidationReason) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>('UNKNOWN');
  const [sessionError, setSessionError] = useState<string | null>(null);
  
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const sessionInvalidatedRef = useRef(false);
  const authRequestIdRef = useRef(0);

  /** Centralized session invalidation - ONLY this function may purge tokens & user state */
  const invalidateSession = useCallback((reason: SessionInvalidationReason) => {
    console.warn(`[AUTH] Session invalidated: reason=${reason}`);
    authRequestIdRef.current += 1;
    sessionInvalidatedRef.current = true;
    tokenStore.clear();
    setUser(null);
    setSessionState(reason === 'USER_SIGNED_OUT' ? 'SIGNED_OUT' : 'INVALID');
    setSessionError(null);
  }, []);

  const signOut = useCallback(() => {
    invalidateSession('USER_SIGNED_OUT');
    void authApi.logout().catch(() => undefined);
  }, [invalidateSession]);

  const refresh = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const currentReqId = ++authRequestIdRef.current;

    const promise = (async () => {
      const token = tokenStore.get();
      if (!token) {
        if (currentReqId === authRequestIdRef.current) {
          setUser(null);
          setSessionState('SIGNED_OUT');
          setSessionError(null);
        }
        return;
      }

      if (currentReqId === authRequestIdRef.current) {
        setSessionState('CHECKING');
      }
      sessionInvalidatedRef.current = false;

      let attempt = 0;
      const maxRetries = 2;

      while (attempt <= maxRetries) {
        if (currentReqId !== authRequestIdRef.current) return;

        try {
          const result = await authApi.me();
          if (currentReqId !== authRequestIdRef.current) {
            console.log(`[AUTH] Ignored stale /auth/me response (reqId=${currentReqId})`);
            return;
          }
          setUser(result.data);
          setSessionState('AUTHENTICATED');
          setSessionError(null);
          return;
        } catch (err) {
          if (currentReqId !== authRequestIdRef.current) return;

          if (err instanceof ApiRequestError) {
            // 1. Transient connection / 5xx / database / timeout error -> PRESERVE TOKEN
            if (err.isNetworkOrServerError || err.code === 'DATABASE_ERROR' || err.code === 'SERVER_ERROR' || err.code === 'TIMEOUT') {
              attempt += 1;
              if (attempt <= maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                continue;
              }
              console.warn(`[AUTH] Transient error during session check (status=${err.status}, code=${err.code}). Token preserved.`);
              if (currentReqId === authRequestIdRef.current) {
                setSessionState('TRANSIENT_ERROR');
                setSessionError(err.message || 'Server connection lost. Retrying...');
              }
              return;
            }

            // 2. Confirmed session invalidation codes
            if (err.code && AUTH_INVALIDATION_CODES.has(err.code)) {
              let reason: SessionInvalidationReason = 'INVALID_TOKEN';
              if (err.code === 'AUTH_TOKEN_EXPIRED') reason = 'TOKEN_EXPIRED';
              else if (err.code === 'ACCOUNT_DISABLED') reason = 'ACCOUNT_DISABLED';
              else if (err.code === 'ACCOUNT_NOT_FOUND') reason = 'ACCOUNT_DELETED';

              invalidateSession(reason);
              return;
            }
          }

          attempt += 1;
          if (attempt <= maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          }
        }
      }

      if (currentReqId === authRequestIdRef.current) {
        setSessionState('TRANSIENT_ERROR');
        setSessionError('Temporary server issue. Retrying...');
      }
    })();

    refreshPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, [invalidateSession]);

  useEffect(() => {
    // Register global unauthorized handler triggered by explicit session invalidation codes
    setUnauthorizedHandler((code?: string) => {
      let reason: SessionInvalidationReason = 'INVALID_TOKEN';
      if (code === 'AUTH_TOKEN_EXPIRED') reason = 'TOKEN_EXPIRED';
      else if (code === 'ACCOUNT_DISABLED') reason = 'ACCOUNT_DISABLED';
      else if (code === 'ACCOUNT_NOT_FOUND') reason = 'ACCOUNT_DELETED';

      invalidateSession(reason);
    });

    // Multi-tab synchronization
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'crm.token') {
        if (!e.newValue) {
          // Another tab logged out
          console.log('[AUTH] Storage event: token removed in another tab.');
          invalidateSession('USER_SIGNED_OUT');
        } else if (e.newValue !== e.oldValue) {
          // Another tab logged in
          console.log('[AUTH] Storage event: token updated in another tab.');
          void refresh();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    void refresh();

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refresh, invalidateSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: sessionState === 'UNKNOWN' || sessionState === 'CHECKING',
      sessionState,
      sessionError,
      isAdmin: user?.role === 'ADMIN',
      signIn: (token: string, nextUser: User) => {
        authRequestIdRef.current += 1;
        sessionInvalidatedRef.current = false;
        tokenStore.set(token);
        setUser(nextUser);
        setSessionState('AUTHENTICATED');
        setSessionError(null);
      },
      signOut,
      refresh,
      retrySession: refresh,
      invalidateSession,
    }),
    [user, sessionState, sessionError, signOut, refresh, invalidateSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
