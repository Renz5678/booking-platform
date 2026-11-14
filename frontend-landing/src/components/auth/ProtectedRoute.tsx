"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, RoleEnum } from "@/context/AuthContext";
import { Spinner } from "@/components/ui/LoadingState";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: RoleEnum[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      if (user.role === "client") router.push("/dashboard");
      else if (user.role === "counselor") router.push("/counselor/dashboard");
      else if (user.role === "admin") router.push("/admin/dashboard");
    }
  }, [user, isLoading, router, pathname, allowedRoles]);

  if (isLoading || !user || (allowedRoles && !allowedRoles.includes(user.role))) {
    const statusLabel = isLoading
      ? "Verifying your session…"
      : !user
        ? "Redirecting to sign in…"
        : "Redirecting to your dashboard…";

    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex flex-col bg-background"
      >
        <div className="h-16 border-b border-border-subtle bg-surface-elevated/80 px-6 flex items-center justify-between">
          <div className="h-6 w-24 rounded-md bg-surface-muted animate-pulse" />
          <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary">
            <Spinner size="sm" className="text-primary" />
            <span>{statusLabel}</span>
          </div>
        </div>
        <div className="max-w-[1200px] w-full mx-auto px-4 md:px-8 py-10 space-y-6 animate-pulse">
          <div className="h-9 w-56 rounded-lg bg-surface-muted" />
          <div className="h-4 w-80 max-w-full rounded bg-surface-muted/80" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            <div className="h-52 rounded-2xl border border-border-subtle bg-surface-elevated" />
            <div className="h-52 rounded-2xl border border-border-subtle bg-surface-elevated hidden md:block" />
            <div className="h-52 rounded-2xl border border-border-subtle bg-surface-elevated hidden lg:block" />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
