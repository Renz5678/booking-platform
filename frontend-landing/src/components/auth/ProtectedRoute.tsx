"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, RoleEnum } from "@/context/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: RoleEnum[];
}

export const clearAuthCache = () => {
  // Maintained for backwards compatibility
};

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login");
        return;
      }

      if (allowedRoles && !allowedRoles.includes(user.role)) {
        if (user.role === "client") router.push("/dashboard");
        else if (user.role === "counselor") router.push("/counselor/dashboard");
        else if (user.role === "admin") router.push("/admin/dashboard");
      }
    }
  }, [user, isLoading, allowedRoles, router]);

  if (isLoading || !user || (allowedRoles && !allowedRoles.includes(user.role))) {
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
