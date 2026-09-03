import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, TOKEN_KEY, type Farmer, type StaffUser } from '@/lib/api';

export type AuthUser = (Farmer & { role: 'FARMER' }) | (StaffUser & { role: 'ADMIN' | 'STAFF' });

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  isFarmer: boolean;
  isStaff: boolean;
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data.user);
    } catch {
      // A stale token is worse than none — clear it and let the user sign in.
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback((token: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(nextUser);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? ({ ...prev, ...patch } as AuthUser) : prev));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      isFarmer: user?.role === 'FARMER',
      isStaff: user?.role === 'STAFF' || user?.role === 'ADMIN',
      signIn,
      signOut,
      refresh,
      updateUser,
    }),
    [user, loading, signIn, signOut, refresh, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
