"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchSiteContentMap } from "@/lib/content";
import { isAuthRoute, isDashboardChromeRoute } from "@/lib/routes";

const DEFAULT_BANNER_TEXT =
  "In immediate danger? Call the National Mental Health Crisis Hotline.";

export default function CrisisBanner() {
  const pathname = usePathname();
  const hideBanner = isAuthRoute(pathname) || isDashboardChromeRoute(pathname);
  const [isVisible, setIsVisible] = useState(true);
  const [bannerText, setBannerText] = useState(DEFAULT_BANNER_TEXT);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchSiteContentMap().then((map) => {
      if (!active) return;
      const customText = map.crisis_banner || map.crisis_banner_text;
      if (customText) {
        setBannerText(customText);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!isVisible || hideBanner || !bannerRef.current) {
      root.style.setProperty("--crisis-banner-h", "0px");
      return;
    }

    const updateHeight = () => {
      if (!bannerRef.current) return;
      root.style.setProperty(
        "--crisis-banner-h",
        `${bannerRef.current.offsetHeight}px`
      );
    };

    updateHeight();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateHeight)
        : null;
    observer?.observe(bannerRef.current);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
      root.style.setProperty("--crisis-banner-h", "0px");
    };
  }, [isVisible, hideBanner, bannerText]);

  if (!isVisible || hideBanner) return null;

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-label="Crisis support hotline"
      className="sticky top-0 z-50 flex flex-col items-center justify-between gap-2 bg-tertiary-container px-4 py-2.5 text-center font-label-md text-white shadow-sm sm:flex-row sm:text-left md:px-margin-desktop"
    >
      <p className="text-xs sm:text-sm leading-snug">{bannerText}</p>
      <div className="flex items-center gap-4 shrink-0">
        <a
          href="tel:1553"
          className="inline-flex min-h-[44px] md:min-h-[34px] items-center justify-center rounded-full bg-surface-light px-4 py-2 font-label-sm text-xs font-bold tracking-wide text-primary shadow-sm transition-all hover:bg-surface-light/90 hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
        >
          Help Now (1553)
        </a>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="flex h-11 w-11 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full text-tertiary-fixed transition-colors hover:bg-white/15 hover:text-white"
          aria-label="Close banner"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[20px]"
          >
            close
          </span>
        </button>
      </div>
    </div>
  );
}
