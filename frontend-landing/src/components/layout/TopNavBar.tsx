"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopNavBar() {
  const pathname = usePathname();
  const isDashboard = pathname?.includes("/dashboard") || pathname?.includes("/counselor") || pathname?.includes("/admin") || pathname?.includes("/faq") || pathname?.includes("/contact");
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
          <Link href="/login" className="text-primary font-label-md hover:opacity-80 transition-opacity">Log In</Link>
          <Link href="/signup" className="bg-secondary text-on-secondary px-6 py-2 rounded-full font-label-md hover:opacity-90 transition-opacity shadow-sm">Sign Up</Link>
        </div>
        {/* Mobile Menu Toggle */}
        <button className="md:hidden text-primary">
          <span className="material-symbols-outlined">menu</span>
        </button>
      </div>
    </nav>
  );
}
