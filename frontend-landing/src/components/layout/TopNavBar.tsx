"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getDashboardPathForRole,
  isAuthRoute,
  isDashboardChromeRoute,
} from "@/lib/routes";

export default function TopNavBar() {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (isAuthRoute(pathname) || isDashboardChromeRoute(pathname)) return null;

  const dashboardHref = getDashboardPathForRole(user?.role);

  return (
    <nav className="bg-surface docked full-width top-0 shadow-sm relative z-40">
      <div className="flex justify-between items-center px-4 md:px-margin-desktop py-4 max-w-container-max mx-auto">
        <Link
          href="/"
          className="font-headline-md text-headline-md font-bold text-primary"
        >
          Alaga
        </Link>

        <div className="hidden md:flex space-x-6 items-center">
          <Link
            className={
              pathname === "/"
                ? "text-secondary border-b-2 border-secondary pb-1 font-label-md hover:opacity-80 transition-opacity"
                : "text-on-surface-variant hover:text-secondary font-label-md hover:opacity-80 transition-opacity"
            }
            href="/"
          >
            Home
          </Link>
          <Link
            className={
              pathname?.startsWith("/counselors")
                ? "text-secondary border-b-2 border-secondary pb-1 font-label-md hover:opacity-80 transition-opacity"
                : "text-on-surface-variant hover:text-secondary font-label-md hover:opacity-80 transition-opacity"
            }
            href="/counselors"
          >
            Find a Counselor
          </Link>
          <Link
            className={
              pathname === "/faq"
                ? "text-secondary border-b-2 border-secondary pb-1 font-label-md hover:opacity-80 transition-opacity"
                : "text-on-surface-variant hover:text-secondary font-label-md hover:opacity-80 transition-opacity"
            }
            href="/faq"
          >
            FAQ
          </Link>
          <Link
            className={
              pathname === "/contact"
                ? "text-secondary border-b-2 border-secondary pb-1 font-label-md hover:opacity-80 transition-opacity"
                : "text-on-surface-variant hover:text-secondary font-label-md hover:opacity-80 transition-opacity"
            }
            href="/contact"
          >
            Contact
          </Link>
        </div>

        <div className="hidden md:flex space-x-4 items-center">
          {isLoading ? (
            <div className="h-6 w-24 bg-surface-variant animate-pulse rounded" />
          ) : user ? (
            <>
              <Link
                href={dashboardHref}
                className="text-primary font-label-md hover:opacity-80 transition-opacity"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={logout}
                className="bg-surface-variant text-on-surface-variant px-6 py-2 rounded-full font-label-md hover:opacity-90 transition-opacity"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-primary font-label-md hover:opacity-80 transition-opacity"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="bg-secondary text-on-secondary px-6 py-2 rounded-full font-label-md hover:opacity-90 transition-opacity shadow-sm"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          onClick={() => setIsMobileOpen((prev) => !prev)}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileOpen}
          className="md:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl text-primary hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            {isMobileOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="md:hidden border-t border-border-subtle bg-surface-elevated px-4 py-4 space-y-2 shadow-md">
          <Link
            href="/"
            onClick={() => setIsMobileOpen(false)}
            className="block rounded-xl px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-muted"
          >
            Home
          </Link>
          <Link
            href="/counselors"
            onClick={() => setIsMobileOpen(false)}
            className="block rounded-xl px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-muted"
          >
            Find a Counselor
          </Link>
          <Link
            href="/faq"
            onClick={() => setIsMobileOpen(false)}
            className="block rounded-xl px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-muted"
          >
            FAQ
          </Link>
          <Link
            href="/contact"
            onClick={() => setIsMobileOpen(false)}
            className="block rounded-xl px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-muted"
          >
            Contact
          </Link>
          <div className="pt-2 border-t border-border-subtle flex flex-col gap-2">
            {user ? (
              <>
                <Link
                  href={dashboardHref}
                  onClick={() => setIsMobileOpen(false)}
                  className="block text-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileOpen(false);
                    logout();
                  }}
                  className="w-full rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-surface-muted"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setIsMobileOpen(false)}
                  className="block text-center rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-primary"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setIsMobileOpen(false)}
                  className="block text-center rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
