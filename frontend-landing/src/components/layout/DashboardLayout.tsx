"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ProtectedRoute, { clearAuthCache } from "../auth/ProtectedRoute";

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRoles: ("client" | "counselor" | "admin")[];
  role: "client" | "counselor" | "admin";
}

export default function DashboardLayout({ children, allowedRoles, role }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch("http://localhost:8000/auth/logout", {
        method: "POST",
        credentials: "include"
      });
      clearAuthCache();
      router.push("/");
    } catch (err) {
      console.error("Failed to log out", err);
    }
  };

  // Define navigation items based on role
  let navItems = [];
  if (role === "client") {
    navItems = [
      { name: "Dashboard", path: "/dashboard" },
      { name: "Find a Counselor", path: "/counselors" },
      { name: "FAQ", path: "/faq" },
      { name: "Contact", path: "/contact" },
    ];
  } else if (role === "counselor") {
    navItems = [
      { name: "Dashboard", path: "/counselor/dashboard" },
      { name: "My Availability", path: "/counselor/availability" },
      { name: "My Bookings", path: "/counselor/bookings" },
      { name: "My Profile", path: "/counselor/profile" },
    ];
  } else if (role === "admin") {
    navItems = [
      { name: "Dashboard", path: "/admin/dashboard" },
      { name: "Counselors", path: "/admin/counselors" },
      { name: "Bookings", path: "/admin/bookings" },
      { name: "Analytics", path: "/admin/analytics" },
      { name: "Content", path: "/admin/content" },
    ];
  }

  if (role === "admin") {
    return (
      <ProtectedRoute allowedRoles={allowedRoles}>
        <div className="font-sans text-on-surface antialiased flex bg-surface min-h-screen">
          {/* SideNavBar */}
          <nav className="bg-surface-container-low border-r border-outline-variant shadow-sm h-full w-64 fixed left-0 top-0 flex flex-col p-4 gap-2 z-50">
            <div className="mb-8 px-4 mt-4">
              <h1 className="font-headline-md text-[24px] font-bold text-primary">Alaga Admin</h1>
              <p className="font-label-md text-[14px] text-on-surface-variant">System Overview</p>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.path}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${
                    pathname === item.path
                      ? "bg-secondary-container text-on-secondary-container translate-x-1 transition-transform"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  <span className="material-symbols-outlined">{item.name === "Dashboard" ? "dashboard" : item.name === "Counselors" ? "groups" : item.name === "Bookings" ? "event_note" : item.name === "Analytics" ? "analytics" : "article"}</span>
                  <span className="font-label-md text-[14px] font-medium">{item.name}</span>
                </Link>
              ))}
              <Link
                href="#"
                className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-high rounded-lg px-4 py-3 transition-colors"
              >
                <span className="material-symbols-outlined">account_circle</span>
                <span className="font-label-md text-[14px] font-medium">Account</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 text-error hover:bg-error-container hover:text-on-error-container rounded-lg px-4 py-3 transition-colors text-left"
              >
                <span className="material-symbols-outlined">logout</span>
                <span className="font-label-md text-[14px] font-medium">Log Out</span>
              </button>
            </div>
            <div className="mt-auto pt-4 border-t border-outline-variant flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined">shield_person</span>
              </div>
              <div>
                <p className="font-label-md text-[14px] font-bold text-primary">Admin User</p>
                <p className="font-label-sm text-[12px] text-on-surface-variant">Admin</p>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="ml-64 flex-1 p-4 md:p-10 bg-surface min-h-screen">
            <div className="max-w-[1200px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <div className="text-on-background font-body-md antialiased min-h-screen flex flex-col bg-[#E1F4F1]">
        {/* Navigation */}
        <nav className="bg-surface docked full-width shadow-sm z-40 relative">
          <div className="flex justify-between items-center px-4 md:px-margin-desktop py-4 max-w-[1200px] mx-auto">
            <Link href="/" className="font-headline-md text-headline-md font-bold text-primary">
              Alaga
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex gap-2 items-center text-center font-label-md">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.path}
                  className={`px-5 py-2 rounded-full transition-all duration-200 ${
                    pathname === item.path
                      ? "bg-tertiary-container text-white font-bold shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-variant/50 hover:text-primary"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>

            <div className="hidden md:flex gap-4 items-center">
              <button className="font-label-md text-label-md text-primary hover:opacity-80 transition-opacity">Profile</button>
              <button onClick={handleLogout} className="font-label-md text-label-md text-error hover:opacity-80 transition-opacity font-bold">Log Out</button>
            </div>

            {/* Mobile Nav Toggle */}
            <button 
              className="md:hidden text-primary"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
          
          {/* Mobile Nav Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden bg-surface border-t border-surface-variant py-2 px-4 flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.path}
                  className="py-2 text-primary font-medium border-b border-surface-variant"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
              <button className="py-2 text-left text-primary font-medium mt-2">Profile</button>
              <button onClick={handleLogout} className="py-2 text-left text-error font-medium">Log Out</button>
            </div>
          )}
        </nav>

        {/* Main Content Area */}
        <main className="flex-grow w-full max-w-[1200px] mx-auto px-4 md:px-margin-desktop py-section-gap flex flex-col gap-section-gap">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
