"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";

export type RoleEnum = "client" | "counselor" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: RoleEnum;
  is_verified: boolean;
  google_calendar_connected: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const checkAuth = async () => {
    setIsLoading(true);
    try {
      const data = await api.get("/auth/me");
      setUser(data);
      setError(null);
    } catch (err) {
      setUser(null);
      if (err instanceof ApiError && err.status === 401) {
        // Expected when not logged in
      } else {
        console.error("Auth check failed:", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const logout = async () => {
    try {
      await api.post("/auth/logout", {});
      setUser(null);
      router.push("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error, checkAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
