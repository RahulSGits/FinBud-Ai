'use client';
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string | null;
  company?: string | null;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  whatsappEnabled?: boolean;
  whatsappTemplate?: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, company: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    fetchMe().finally(() => setLoading(false));
  }, [fetchMe]);

  const signIn = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Login failed' };
    setUser(data.user);
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string, company: string) => {
    const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, fullName, company }) });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Registration failed' };
    setUser(data.user);
    return { error: null };
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const refreshProfile = async () => {
    await fetchMe();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin: user?.role === 'admin', signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
