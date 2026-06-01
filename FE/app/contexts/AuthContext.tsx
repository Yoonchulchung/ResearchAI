"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { tokenStore } from "@/lib/api/base";
import { getMeApi, loginApi, registerApi, AuthUser } from "@/lib/api/auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (username: string, password: string, turnstileToken?: string, registerCode?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await getMeApi();
      setUser(me);
    } catch {
      setUser(null);
      tokenStore.clear();
    }
  }, []);

  useEffect(() => {
    const hasCookie = typeof document !== "undefined" &&
      document.cookie.split(";").some((c) => c.trim().startsWith("auth_token="));
    if (tokenStore.get() || hasCookie) {
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = async (username: string, password: string, turnstileToken?: string) => {
    const { accessToken } = await loginApi(username, password, turnstileToken);
    tokenStore.set(accessToken);
    const me = await getMeApi();
    setUser(me);
  };

  const register = async (username: string, password: string, turnstileToken?: string, registerCode?: string) => {
    const { accessToken } = await registerApi(username, password, turnstileToken, registerCode);
    tokenStore.set(accessToken);
    const me = await getMeApi();
    setUser(me);
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
