"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function TopNavBar() {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const isDashboard = pathname?.includes("/dashboard") || pathname?.includes("/counselor") || pathname?.includes("/admin") || pathname?.includes("/faq") || pathname?.includes("/contact") || pathname?.includes("/payment");
  const isAuth = pathname === "/login" || pathname === "/signup";
  
  if (isDashboard || isAuth) return null;
  return (
    <nav className="bg-surface docked full-width top-0 shadow-sm relative z-40">
      <div className="flex justify-between items-center px-margin-desktop py-4 max-w-container-max mx-auto">
        <div className="font-headline-md text-headline-md font-bold text-primary">
          Alaga
        </div>
        <div className="hidden md:flex space-x-6 items-center">
          <a className="text-secondary border-b-2 border-secondary pb-1 font-label-md hover:opacity-80 transition-opacity" href="#">Home</a>
          <a className="text-on-surface-variant hover:text-secondary font-label-md hover:opacity-80 transition-opacity" href="#">Find a Counselor</a>
          <a className="text-on-surface-variant hover:text-secondary font-label-md hover:opacity-80 transition-opacity" href="#">FAQ</a>
          <a className="text-on-surface-variant hover:text-secondary font-label-md hover:opacity-80 transition-opacity" href="#">Contact</a>
        </div>
        <div className="hidden md:flex space-x-4 items-center">
          {isLoading ? (
            <div className="h-6 w-24 bg-surface-variant animate-pulse rounded"></div>
          ) : user ? (
            <>
              <Link
                href={user.role === 'counselor' ? '/counselor/dashboard' : user.role === 'admin' ? '/admin/dashboard' : '/dashboard'}
                className="text-primary font-label-md hover:opacity-80 transition-opacity"
              >
                Dashboard
              </Link>
              <button
                onClick={logout}
                className="bg-surface-variant text-on-surface-variant px-6 py-2 rounded-full font-label-md hover:opacity-90 transition-opacity"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-primary font-label-md hover:opacity-80 transition-opacity">Log In</Link>
              <Link href="/signup" className="bg-secondary text-on-secondary px-6 py-2 rounded-full font-label-md hover:opacity-90 transition-opacity shadow-sm">Sign Up</Link>
            </>
          )}
        </div>
        {/* Mobile Menu Toggle */}
        <button className="md:hidden text-primary">
          <span className="material-symbols-outlined">menu</span>
        </button>
      </div>
    </nav>
  );
}
