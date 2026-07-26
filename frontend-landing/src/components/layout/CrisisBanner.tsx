"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

export default function CrisisBanner() {
  const pathname = usePathname();
  const isDashboard = pathname?.includes("/dashboard") || pathname?.includes("/counselor") || pathname?.includes("/admin") || pathname?.includes("/faq") || pathname?.includes("/contact") || pathname?.includes("/payment");
  const isAuth = pathname === "/login" || pathname === "/signup";
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible || isDashboard || isAuth) return null;

  return (
    <div className="bg-on-tertiary-container text-primary font-label-md py-3 px-4 md:px-margin-desktop sticky top-0 z-50 flex flex-col sm:flex-row justify-between items-center text-center sm:text-left shadow-sm relative">
      <p>In immediate danger? Call the National Mental Health Crisis Hotline.</p>
      <div className="flex items-center gap-4 mt-2 sm:mt-0">
        <button className="bg-primary text-on-primary px-4 py-2 rounded-full font-label-sm hover:opacity-90 transition-opacity shrink-0">
          Help Now (1553)
        </button>
        <button 
          onClick={() => setIsVisible(false)}
          className="text-primary hover:opacity-70 transition-opacity p-1 flex items-center justify-center rounded-full hover:bg-black/5"
          aria-label="Close banner"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
    </div>
  );
}
