"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "../auth/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { getInitials } from "@/lib/routes";

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRoles?: ("client" | "counselor" | "admin")[];
  role: "client" | "counselor" | "admin";
}

interface NavItem {
  name: string;
  path: string;
  icon: string;
}

export default function DashboardLayout({
  children,
  allowedRoles,
  role,
}: DashboardLayoutProps) {
  const effectiveAllowedRoles = allowedRoles ?? [role];
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("Failed to log out", err);
    }
  };

  let navItems: NavItem[] = [];
  if (role === "client") {
    navItems = [
      { name: "Dashboard", path: "/dashboard", icon: "space_dashboard" },
      { name: "Find a Counselor", path: "/counselors", icon: "search" },
      { name: "FAQ", path: "/faq", icon: "help" },
      { name: "Contact", path: "/contact", icon: "mail" },
    ];
  } else if (role === "counselor") {
    navItems = [
      { name: "Dashboard", path: "/counselor/dashboard", icon: "space_dashboard" },
      { name: "My Availability", path: "/counselor/availability", icon: "calendar_month" },
      { name: "My Bookings", path: "/counselor/bookings", icon: "event_note" },
      { name: "My Profile", path: "/counselor/profile", icon: "badge" },
    ];
  } else if (role === "admin") {
    navItems = [
      { name: "Dashboard", path: "/admin/dashboard", icon: "dashboard" },
      { name: "Counselors", path: "/admin/counselors", icon: "groups" },
      { name: "Bookings", path: "/admin/bookings", icon: "event_note" },
      { name: "Analytics", path: "/admin/analytics", icon: "analytics" },
      { name: "Content", path: "/admin/content", icon: "article" },
    ];
  }

  const isNavActive = (itemPath: string) => {
    if (pathname === itemPath) return true;
    // Highlight parent section on detail sub-pages (e.g. /admin/bookings/[id])
    if (
      itemPath !== "/dashboard" &&
      itemPath !== "/counselor/dashboard" &&
      itemPath !== "/admin/dashboard" &&
      pathname?.startsWith(`${itemPath}/`)
    ) {
      return true;
    }
    return false;
  };

  if (role === "admin") {
    const adminName = user?.full_name || "Administrator";
    const adminEmail = user?.email || "Admin";

    const sidebarContent = (
      <div className="flex flex-col h-full p-4 gap-2">
        <div className="mb-6 px-3 mt-2 flex items-center justify-between">
          <div>
            <Link
              href="/admin/dashboard"
              translate="no"
              className="font-serif text-[24px] font-semibold text-primary block leading-tight"
            >
              Alaga Admin
            </Link>
            <p className="font-label-sm text-on-surface-variant mt-0.5">
              Platform Operations
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close admin navigation"
            className="lg:hidden p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <nav aria-label="Admin navigation" className="flex-1 flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isNavActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 font-label-md transition-[background-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  active
                    ? "bg-secondary-container text-on-secondary-container font-semibold shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-primary"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.name}</span>
              </Link>
            );
          })}

          <div className="my-2 border-t border-outline-variant/60" />

          <Link
            href="/account"
            aria-current={pathname === "/account" ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 font-label-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              pathname === "/account"
                ? "bg-secondary-container text-on-secondary-container font-semibold"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              account_circle
            </span>
            <span>Account Settings</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 text-error hover:bg-error-container/70 hover:text-on-error-container rounded-xl px-4 py-3 font-label-md transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              logout
            </span>
            <span>Log Out</span>
          </button>
        </nav>

        <div className="mt-auto pt-4 border-t border-outline-variant flex items-center gap-3 px-3 py-2">
          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-md font-bold shrink-0">
            {getInitials(adminName)}
          </div>
          <div className="min-w-0">
            <p className="font-label-md font-semibold text-primary truncate">
              {adminName}
            </p>
            <p className="font-label-sm text-on-surface-variant truncate">
              {adminEmail}
            </p>
          </div>
        </div>
      </div>
    );

    return (
      <ProtectedRoute allowedRoles={effectiveAllowedRoles}>
        <div className="font-sans text-on-surface antialiased flex flex-col lg:flex-row bg-background min-h-screen">
          {/* Mobile Top Bar for Admin */}
          <header className="lg:hidden sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant px-4 py-3 flex items-center justify-between">
            <Link
              href="/admin/dashboard"
              translate="no"
              className="font-serif text-[22px] font-semibold text-primary"
            >
              Alaga Admin
            </Link>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open admin navigation menu"
              aria-expanded={isMobileMenuOpen}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-primary hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                menu
              </span>
            </button>
          </header>

          {/* Desktop Fixed Sidebar */}
          <aside className="hidden lg:block bg-surface-container-low border-r border-outline-variant h-screen w-64 fixed left-0 top-0 z-40 overflow-y-auto">
            {sidebarContent}
          </aside>

          {/* Mobile Slide-Over Drawer */}
          {isMobileMenuOpen && (
            <div
              className="lg:hidden fixed inset-0 z-50 bg-primary/40 backdrop-blur-[2px] flex overscroll-contain animate-fade-in"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <aside
                onClick={(e) => e.stopPropagation()}
                className="w-72 max-w-[85vw] bg-surface-container-low border-r border-outline-variant h-full overflow-y-auto shadow-ambient animate-slide-up"
              >
                {sidebarContent}
              </aside>
            </div>
          )}

          {/* Main Content */}
          <main className="lg:ml-64 flex-1 p-4 md:p-8 lg:p-10 bg-background min-h-screen">
            <div className="max-w-[1200px] mx-auto">{children}</div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={effectiveAllowedRoles}>
      <div className="text-on-background font-body-md antialiased min-h-screen flex flex-col bg-background">
        {/* Sticky Workspace Navigation */}
        <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-outline-variant/70">
          <nav
            aria-label={`${role} workspace navigation`}
            className="flex justify-between items-center px-4 md:px-margin-desktop py-3.5 max-w-[1200px] mx-auto gap-4"
          >
            <Link
              href={role === "counselor" ? "/counselor/dashboard" : "/dashboard"}
              translate="no"
              className="font-serif text-[26px] leading-none font-semibold tracking-tight text-primary hover:opacity-85 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md px-1 -ml-1"
            >
              Alaga
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex gap-1 items-center font-label-md">
              {navItems.map((item) => {
                const active = isNavActive(item.path);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    aria-current={active ? "page" : undefined}
                    className={`px-4 py-2 rounded-full transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      active
                        ? "bg-secondary-container text-on-secondary-container font-semibold shadow-sm"
                        : "text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>

            <div className="hidden md:flex gap-3 items-center">
              <Link
                href="/account"
                aria-current={pathname === "/account" ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full font-label-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  pathname === "/account"
                    ? "bg-secondary-container text-on-secondary-container font-semibold"
                    : "text-primary hover:bg-surface-container-low"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  account_circle
                </span>
                Account
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 rounded-full border border-outline-variant font-label-md text-on-surface-variant hover:text-error hover:border-error/40 hover:bg-error-container/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
              >
                Log Out
              </button>
            </div>

            {/* Mobile Nav Toggle */}
            <button
              type="button"
              className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-primary hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? "Close workspace menu" : "Open workspace menu"}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {isMobileMenuOpen ? "close" : "menu"}
              </span>
            </button>
          </nav>

          {/* Mobile Nav Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden bg-surface-container-lowest border-t border-outline-variant py-3 px-4 flex flex-col gap-1.5 shadow-ambient animate-slide-up overscroll-contain">
              {navItems.map((item) => {
                const active = isNavActive(item.path);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-label-md transition-colors ${
                      active
                        ? "bg-secondary-container text-on-secondary-container font-semibold"
                        : "text-on-surface hover:bg-surface-container-low"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.name}
                  </Link>
                );
              })}
              <div className="border-t border-outline-variant my-1.5 pt-2 grid grid-cols-2 gap-2">
                <Link
                  href="/account"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-center px-4 py-2.5 rounded-xl border border-outline-variant text-primary font-label-md"
                >
                  Account
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="text-center px-4 py-2.5 rounded-xl border border-error/30 text-error font-label-md"
                >
                  Log Out
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Main Content Area */}
        <main className="flex-grow w-full max-w-[1200px] mx-auto px-4 md:px-margin-desktop py-8 flex flex-col gap-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
