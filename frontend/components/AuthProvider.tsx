"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface User {
  id: string;
  username: string;
}

interface VaultData {
  credentials?: {
    subscription_id: string;
    tenant_id: string;
    client_id: string;
    client_secret: string;
    ssh_private_key: string;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  vault: VaultData | null;
  vaultLocked: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  unlockVault: (password: string) => Promise<void>;
  lockVault: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [vault, setVault] = useState<VaultData | null>(null);
  const [vaultLocked, setVaultLocked] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("privateai_token");
    if (stored) {
      setToken(stored);
      fetchUser(stored);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUser = async (t: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        localStorage.removeItem("privateai_token");
        setToken(null);
      }
    } catch {
      localStorage.removeItem("privateai_token");
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);

    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Login failed");
    }

    const data = await res.json();
    localStorage.setItem("privateai_token", data.access_token);
    setToken(data.access_token);
    await fetchUser(data.access_token);

    // Try auto-unlock vault with same password (dynamic import)
    try {
      const { retrieveVault, vaultDecrypt } = await import("@/lib/vault");
      const blob = await retrieveVault();
      const decrypted = await vaultDecrypt(blob, password);
      setVault(JSON.parse(decrypted));
      setVaultLocked(false);
    } catch {
      setVaultLocked(true);
    }
  };

  const register = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Registration failed");
    }

    await login(username, password);
  };

  const logout = useCallback(() => {
    localStorage.removeItem("privateai_token");
    setToken(null);
    setUser(null);
    setVault(null);
    setVaultLocked(true);
  }, []);

  const unlockVault = async (password: string) => {
    const { retrieveVault, vaultDecrypt } = await import("@/lib/vault");
    const blob = await retrieveVault();
    const decrypted = await vaultDecrypt(blob, password);
    setVault(JSON.parse(decrypted));
    setVaultLocked(false);
  };

  const lockVault = useCallback(() => {
    setVault(null);
    setVaultLocked(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        vault,
        vaultLocked,
        login,
        register,
        logout,
        unlockVault,
        lockVault,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
