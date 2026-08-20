'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  // Kept in step with the Role enum by hand: this is the client's view of the
  // session, and a role missing here is a comparison TypeScript quietly calls
  // impossible rather than an error anyone sees.
  role: 'super_admin' | 'admin' | 'manager' | 'employee' | 'viewer';
  employeeId?: string | null;
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Where a role lands after signing in.
 *
 * The platform owner belongs to no company, so both company areas would show
 * them nothing — this used to send them to /dashboard and rely on the login
 * page's effect to bounce them onward, which meant a visible detour through a
 * page they cannot use.
 */
export function homeFor(role: SessionUser['role']): string {
  if (role === 'super_admin') return '/platform';
  if (role === 'admin') return '/admin';
  return '/dashboard';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      setUser(res.ok ? await res.json() : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) return { ok: false, error: data.error || 'Sign in failed' };

    setUser(data.user);
    // A first-login account must set its own password before anything else.
    if (data.user.mustChangePassword) router.push('/change-password');
    else router.push(homeFor(data.user.role));
    return { ok: true };
  }, [router]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        // Matches lib/authz.ts `isAdmin` — the platform owner counts. Two
        // predicates with the same name that disagree is a trap.
        isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
