"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

const DEFAULT_BANNER_TEXT = "In immediate danger? Call the National Mental Health Crisis Hotline.";

export default function CrisisBanner() {
  const pathname = usePathname();
  const isDashboard = pathname?.includes("/dashboard") || pathname?.includes("/counselor") || pathname?.includes("/admin") || pathname?.includes("/faq") || pathname?.includes("/contact") || pathname?.includes("/payment");
  const isAuth = pathname === "/login" || pathname === "/signup";
  const [isVisible, setIsVisible] = useState(true);
  const [bannerText, setBannerText] = useState(DEFAULT_BANNER_TEXT);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const data = await api.get("/admin/content");
        if (Array.isArray(data)) {
          const item = data.find((entry: { key?: string; value?: string }) => entry.key === "crisis_banner_text");
          if (item?.value && item.value.trim()) {
            setBannerText(item.value);
          }
        }
      } catch (err) {
        console.error("Failed to fetch crisis banner text:", err);
      }
    };
    fetchContent();
  }, []);

  if (!isVisible || isDashboard || isAuth) return null;

  return (
    <div className="bg-on-tertiary-container text-primary font-label-md py-3 px-4 md:px-margin-desktop sticky top-0 z-50 flex flex-col sm:flex-row justify-between items-center text-center sm:text-left shadow-sm relative">
      <p>{bannerText}</p>
      <div className="flex items-center gap-4 mt-2 sm:mt-0">
        <a href="tel:1553" className="bg-primary text-on-primary px-4 py-2 rounded-full font-label-sm hover:opacity-90 transition-opacity shrink-0">
          Help Now (1553)
        </a>
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
