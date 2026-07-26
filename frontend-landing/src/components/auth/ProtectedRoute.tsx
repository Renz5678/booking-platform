"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: "client" | "counselor" | "admin";
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ("client" | "counselor" | "admin")[];
}

let cachedUser: User | null = null;

export const clearAuthCache = () => {
  cachedUser = null;
};

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);

  useEffect(() => {
    if (cachedUser) {
      if (allowedRoles && !allowedRoles.includes(cachedUser.role)) {
        if (cachedUser.role === "client") router.push("/dashboard");
        else if (cachedUser.role === "counselor") router.push("/counselor/dashboard");
        else if (cachedUser.role === "admin") router.push("/admin/dashboard");
      }
      return;
    }

    const verifyAuth = async () => {
      try {
        const res = await fetch("http://localhost:8000/auth/me", {
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Not authenticated");
        }

        const data: User = await res.json();
        cachedUser = data;
        setUser(data);

        // Check role authorization
        if (allowedRoles && !allowedRoles.includes(data.role)) {
          // Route them to their respective dashboards
          if (data.role === "client") router.push("/dashboard");
          else if (data.role === "counselor") router.push("/counselor/dashboard");
          else if (data.role === "admin") router.push("/admin/dashboard");
          return;
        }

        setLoading(false);
      } catch (err) {
        // Not authenticated or error
        router.push("/login");
      }
    };

    verifyAuth();
  }, [router, pathname, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#E1F4F1] animate-pulse">
        <div className="h-16 bg-surface shadow-sm full-width w-full mb-12"></div>
        <div className="max-w-[1200px] w-full mx-auto px-4 md:px-8 space-y-6">
          <div className="h-12 w-64 bg-surface-variant/30 rounded-lg"></div>
          <div className="h-4 w-96 bg-surface-variant/20 rounded"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
             <div className="h-64 bg-surface-container-lowest rounded-xl shadow-sm"></div>
             <div className="h-64 bg-surface-container-lowest rounded-xl shadow-sm hidden md:block"></div>
             <div className="h-64 bg-surface-container-lowest rounded-xl shadow-sm hidden lg:block"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
    </>
  );
}
