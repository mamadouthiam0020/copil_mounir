import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, clearSession, getMemoryToken, loadSession, saveSession } from '@/lib/api';
import type { Role, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: User) => void;
  hasRole: (...roles: Role[]) => boolean;
  isAdmin: boolean;
  canManage: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => loadSession()?.user ?? null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((next: User) => {
    setUserState(next);
    const token = getMemoryToken();
    if (token) saveSession({ token, user: next });
    else localStorage.setItem('copil.session.v1', JSON.stringify({ user: next }));
  }, []);

  const applySession = useCallback((token: string, next: User) => {
    saveSession({ token, user: next });
    setUserState(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await api.post<{ data: { token: string; user: User } }>('/auth/refresh');
      applySession(result.data.token, result.data.user);
    } catch {
      clearSession();
      setUserState(null);
    }
  }, [applySession]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (getMemoryToken()) {
        try {
          const result = await api.get<{ data: User }>('/auth/me');
          if (active) setUserState(result.data);
          return;
        } catch {
          // Le token en mémoire est périmé : tentative de renouvellement.
        }
      }
      if (loadSession()) await refresh();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearSession();
      setUserState(null);
    };
    window.addEventListener('copil:unauthorized', onUnauthorized);
    return () => window.removeEventListener('copil:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ data: { token: string; user: User } }>('/auth/login', { email, password });
    applySession(result.data.token, result.data.user);
    setLoading(false);
    return result.data.user;
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // La déconnexion locale reste appliquée même si le serveur est injoignable.
    }
    clearSession();
    setUserState(null);
  }, []);

  const hasRole = useCallback((...roles: Role[]) => Boolean(user && roles.includes(user.role)), [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login,
    logout,
    refresh,
    setUser,
    hasRole,
    isAdmin: user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN',
    canManage: Boolean(user && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)),
  }), [user, loading, login, logout, refresh, setUser, hasRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
