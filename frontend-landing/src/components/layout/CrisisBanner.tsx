"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

export default function CrisisBanner() {
  const pathname = usePathname();
  const [bannerText, setBannerText] = useState("In immediate danger? Call the National Mental Health Crisis Hotline.");

  // Hide only on internal dashboard, payment, and auth flows
  const isDashboard = 
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/counselor/") ||
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/account") ||
    pathname?.startsWith("/payment");
  const isAuth = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const data = await api.get("/admin/content");
        if (Array.isArray(data)) {
          const banner = data.find((item: any) => item.key === "crisis_banner_text");
          if (banner && banner.value) {
            setBannerText(banner.value);
          }
        }
      } catch {
        // Fallback default remains
      }
    };
    fetchContent();
  }, []);

  if (isDashboard || isAuth) return null;

  return (
    <div className="bg-on-tertiary-container text-primary font-label-md py-2.5 px-4 md:px-12 sticky top-0 z-50 flex flex-col sm:flex-row justify-between items-center text-center sm:text-left shadow-sm">
      <p className="text-[14px] font-medium">{bannerText}</p>
      <div className="flex items-center gap-4 mt-2 sm:mt-0">
        <a 
          href="tel:1553"
          className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-sm hover:opacity-90 transition-opacity shrink-0 inline-flex items-center gap-1.5 shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">call</span>
          Help Now (1553)
        </a>
      </div>
    </div>
  );
}
