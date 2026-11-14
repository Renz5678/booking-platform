"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function TopNavBar() {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Hide TopNavBar only inside internal dashboard, payment, and auth flows
  const isDashboard = 
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/counselor/") ||
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/account") ||
    pathname?.startsWith("/payment");
  const isAuth = pathname === "/login" || pathname === "/signup";
  
  if (isDashboard || isAuth) return null;

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Find a Counselor", href: "/counselors" },
    { name: "FAQ", href: "/faq" },
    { name: "Contact", href: "/contact" },
  ];

  return (
    <nav className="bg-surface docked full-width top-0 shadow-sm relative z-40 border-b border-outline-variant/30">
      <div className="flex justify-between items-center px-6 md:px-12 py-4 max-w-7xl mx-auto">
        <Link href="/" className="font-headline-md text-headline-md font-bold text-primary">
          Alaga
        </Link>
        <div className="hidden md:flex space-x-6 items-center">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`${
                  isActive
                    ? "text-secondary border-b-2 border-secondary pb-1 font-semibold"
                    : "text-on-surface-variant hover:text-secondary"
                } font-label-md hover:opacity-80 transition-all`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
        <div className="hidden md:flex space-x-4 items-center">
          {isLoading ? (
            <div className="h-6 w-24 bg-surface-variant animate-pulse rounded-full"></div>
          ) : user ? (
            <>
              <Link
                href={user.role === "counselor" ? "/counselor/dashboard" : user.role === "admin" ? "/admin/dashboard" : "/dashboard"}
                className="text-primary font-label-md hover:opacity-80 transition-opacity font-medium"
              >
                Dashboard
              </Link>
              <button
                onClick={logout}
                className="bg-surface-variant text-on-surface-variant px-5 py-2 rounded-full font-label-md hover:opacity-90 transition-opacity"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-primary font-label-md hover:opacity-80 transition-opacity font-medium">Log In</Link>
              <Link href="/signup" className="bg-secondary text-on-secondary px-6 py-2 rounded-full font-label-md hover:opacity-90 transition-opacity shadow-sm">Sign Up</Link>
            </>
          )}
        </div>
        {/* Mobile Menu Toggle */}
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden text-primary p-1 focus:outline-none"
          aria-label="Toggle navigation menu"
        >
          <span className="material-symbols-outlined">{mobileMenuOpen ? "close" : "menu"}</span>
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-surface border-t border-outline-variant px-6 py-4 flex flex-col gap-3">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 text-primary font-medium border-b border-surface-variant/40"
            >
              {link.name}
            </Link>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            {user ? (
              <>
                <Link
                  href={user.role === "counselor" ? "/counselor/dashboard" : user.role === "admin" ? "/admin/dashboard" : "/dashboard"}
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-primary font-bold"
                >
                  Go to Dashboard
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="py-2 text-left text-error font-medium"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="flex gap-4 pt-2">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 px-4 rounded-full border border-primary text-primary text-center flex-1 font-label-md"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 px-4 rounded-full bg-secondary text-on-secondary text-center flex-1 font-label-md"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
