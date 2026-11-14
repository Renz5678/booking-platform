"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getDashboardPathForRole,
  isAuthRoute,
  isDashboardChromeRoute,
} from "@/lib/routes";

function useManilaTime() {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    const format = () => {
      try {
        const now = new Date();
        const time = new Intl.DateTimeFormat("en-PH", {
          timeZone: "Asia/Manila",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }).format(now);
        setLabel(`${time} PHT`);
      } catch {
        setLabel("UTC+8");
      }
    };
    format();
    const id = setInterval(format, 30000);
    return () => clearInterval(id);
  }, []);

  return label;
}

const NAV_LINKS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  {
    href: "/counselors",
    label: "Counselors",
    match: (p: string) => p.startsWith("/counselors"),
  },
  { href: "/faq", label: "FAQ", match: (p: string) => p === "/faq" },
  { href: "/contact", label: "Contact", match: (p: string) => p === "/contact" },
];

export default function TopNavBar() {
  const pathname = usePathname();
  const { user, isLoading, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const manilaTime = useManilaTime();

  useEffect(() => {
    if (!isMobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileOpen]);

  if (isAuthRoute(pathname) || isDashboardChromeRoute(pathname)) return null;

  const dashboardHref = getDashboardPathForRole(user?.role);

  return (
    <header className="relative z-40 border-b border-outline-variant bg-background/95 backdrop-blur-sm">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-container-max items-center justify-between px-4 py-4 md:px-margin-desktop"
      >
        <div className="flex items-center gap-6">
          <Link
            href="/"
            translate="no"
            className="font-serif text-[26px] leading-none tracking-[-0.02em] text-primary transition-opacity hover:opacity-80"
          >
            Alaga
          </Link>
          {manilaTime && (
            <span
              className="hidden lg:inline-flex items-center gap-1.5 border-l border-outline-variant pl-5 text-xs font-medium text-on-surface-variant tabular-nums"
              title="All sessions are scheduled in Philippine Standard Time"
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-secondary"
              />
              Manila {manilaTime}
            </span>
          )}
        </div>

        <div className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((item) => {
            const active = item.match(pathname || "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`nav-draw py-1 text-sm font-medium ${
                  active
                    ? "text-primary"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-4">
          {isLoading ? (
            <div className="h-9 w-28 animate-pulse rounded-full bg-surface-container-low" />
          ) : user ? (
            <>
              <Link
                href={dashboardHref}
                className="nav-draw py-1 text-sm font-medium text-primary"
              >
                Dashboard
              </Link>
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-outline-variant px-5 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="nav-draw py-1 text-sm font-medium text-primary"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                data-fill
                className="btn-fill rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary"
              >
                <span className="btn__fill" aria-hidden="true" />
                Begin care
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsMobileOpen((prev) => !prev)}
          aria-label={isMobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileOpen}
          className="md:hidden inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-primary hover:bg-surface-container-low transition-colors"
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            {isMobileOpen ? "close" : "menu"}
          </span>
        </button>
      </nav>

      {isMobileOpen && (
        <div className="md:hidden border-t border-outline-variant bg-surface-bright px-4 py-5 space-y-1 shadow-ambient">
          {NAV_LINKS.map((item) => {
            const active = item.match(pathname || "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setIsMobileOpen(false)}
                className={`block rounded-lg px-3 py-3 text-base font-medium transition-colors ${
                  active
                    ? "bg-surface-container-low text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-3 pt-3 border-t border-outline-variant flex flex-col gap-2.5">
            {user ? (
              <>
                <Link
                  href={dashboardHref}
                  onClick={() => setIsMobileOpen(false)}
                  className="block rounded-full bg-primary px-5 py-3 text-center text-sm font-semibold text-on-primary"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileOpen(false);
                    logout();
                  }}
                  className="w-full rounded-full border border-outline-variant px-5 py-3 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setIsMobileOpen(false)}
                  className="block rounded-full border border-outline-variant px-5 py-3 text-center text-sm font-semibold text-primary"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setIsMobileOpen(false)}
                  className="block rounded-full bg-secondary px-5 py-3 text-center text-sm font-semibold text-on-secondary"
                >
                  Begin care
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
