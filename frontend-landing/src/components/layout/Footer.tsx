"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAuthRoute, isWorkspaceRoute } from "@/lib/routes";

export default function Footer() {
  const pathname = usePathname();

  if (isWorkspaceRoute(pathname) || isAuthRoute(pathname)) {
    return null;
  }

  return (
    <footer className="w-full mt-section-gap bg-surface-container-low border-t border-outline-variant py-14">
      <div className="max-w-container-max mx-auto px-4 md:px-margin-desktop grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="flex flex-col gap-4">
          <Link
            href="/"
            translate="no"
            className="font-serif text-[26px] font-semibold text-primary w-fit"
          >
            Alaga
          </Link>
          <p className="font-body-md text-on-surface-variant max-w-xs">
            Accessible, confidential, and compassionate online counseling tailored for the Philippines.
          </p>
          <div className="mt-2 p-4 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-ambient max-w-xs">
            <p className="font-label-sm text-on-surface-variant uppercase tracking-wider mb-1">
              National Crisis Hotline (24/7)
            </p>
            <a
              href="tel:1553"
              className="font-headline-md text-error font-bold tabular-nums hover:underline inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                call
              </span>
              1553
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-label-md text-primary font-semibold mb-1">
            Explore
          </h3>
          <Link
            className="font-body-md text-on-surface-variant hover:text-primary transition-colors w-fit"
            href="/#about"
          >
            About Us
          </Link>
          <Link
            className="font-body-md text-on-surface-variant hover:text-primary transition-colors w-fit"
            href="/counselors"
          >
            Find a Counselor
          </Link>
          <Link
            className="font-body-md text-on-surface-variant hover:text-primary transition-colors w-fit"
            href="/faq"
          >
            Frequently Asked Questions
          </Link>
          <Link
            className="font-body-md text-on-surface-variant hover:text-primary transition-colors w-fit"
            href="/contact"
          >
            Contact Support
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-label-md text-primary font-semibold mb-1">
            Trust & Legal
          </h3>
          <Link
            className="font-body-md text-on-surface-variant hover:text-primary transition-colors w-fit"
            href="/privacy-policy"
          >
            Privacy Policy (RA 10173)
          </Link>
          <Link
            className="font-body-md text-on-surface-variant hover:text-primary transition-colors w-fit"
            href="/privacy-policy"
          >
            Terms of Service
          </Link>
          <Link
            className="font-body-md text-on-surface-variant hover:text-primary transition-colors w-fit"
            href="/contact"
          >
            Crisis Resources
          </Link>
        </div>
      </div>

      <div className="max-w-container-max mx-auto px-4 md:px-margin-desktop mt-12 pt-6 border-t border-outline-variant flex flex-col sm:flex-row justify-between items-center gap-2 text-center sm:text-left">
        <p className="font-label-sm text-on-surface-variant">
          © {new Date().getFullYear()} Alaga Counseling. All rights reserved.
        </p>
        <p className="font-label-sm text-on-surface-variant">
          Protected under the Philippine Data Privacy Act (RA 10173)
        </p>
      </div>
    </footer>
  );
}
