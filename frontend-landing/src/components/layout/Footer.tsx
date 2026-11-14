"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { site } from "@/data/site";
import { isAuthRoute, isWorkspaceRoute } from "@/lib/routes";

export default function Footer() {
  const pathname = usePathname();

  if (isWorkspaceRoute(pathname) || isAuthRoute(pathname)) {
    return null;
  }

  return (
    <footer className="w-full border-t border-outline-variant bg-surface-container-low pt-16 pb-10">
      <div className="mx-auto max-w-container-max px-4 md:px-margin-desktop">
        <div className="grid grid-cols-1 gap-10 pb-14 border-b border-outline-variant md:grid-cols-12">
          <div className="md:col-span-5 flex flex-col justify-between gap-6">
            <div>
              <Link
                href="/"
                translate="no"
                className="font-serif text-[44px] leading-none tracking-[-0.03em] text-primary inline-block"
              >
                {site.name}
              </Link>
              <p className="mt-4 max-w-sm text-body-md text-on-surface-variant">
                Confidential, PRC-licensed online counseling tailored for the
                Philippines. Scheduled in Manila Time (UTC+8).
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-4 border border-outline-variant bg-surface-bright px-4 py-3 rounded-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  National Crisis Hotline (24/7)
                </p>
                <a
                  href={`tel:${site.hotline}`}
                  className="mt-0.5 inline-flex items-center gap-1.5 font-serif text-2xl text-error tabular-nums hover:underline"
                >
                  <span
                    className="material-symbols-outlined text-[18px]"
                    aria-hidden="true"
                  >
                    call
                  </span>
                  {site.hotline}
                </a>
              </div>
            </div>
          </div>

          <div className="md:col-span-3 md:col-start-7 flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
              Explore
            </h2>
            <Link
              className="w-fit text-body-md text-primary hover:text-secondary transition-colors"
              href="/counselors"
            >
              Browse Counselors
            </Link>
            <Link
              className="w-fit text-body-md text-primary hover:text-secondary transition-colors"
              href="/#how-it-works"
            >
              How Booking Works
            </Link>
            <Link
              className="w-fit text-body-md text-primary hover:text-secondary transition-colors"
              href="/faq"
            >
              Frequently Asked Questions
            </Link>
            <Link
              className="w-fit text-body-md text-primary hover:text-secondary transition-colors"
              href="/contact"
            >
              Contact Care Desk
            </Link>
          </div>

          <div className="md:col-span-3 flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
              Trust &amp; Privacy
            </h2>
            <Link
              className="w-fit text-body-md text-primary hover:text-secondary transition-colors"
              href="/privacy-policy"
            >
              Privacy Policy ({site.privacyLaw})
            </Link>
            <Link
              className="w-fit text-body-md text-primary hover:text-secondary transition-colors"
              href="/privacy-policy"
            >
              Terms of Service
            </Link>
            <Link
              className="w-fit text-body-md text-primary hover:text-secondary transition-colors"
              href="/signup"
            >
              Create Client Account
            </Link>
            <Link
              className="w-fit text-body-md text-primary hover:text-secondary transition-colors"
              href="/login"
            >
              Sign In
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-3 text-xs text-on-surface-variant sm:flex-row sm:items-center">
          <p>
            &copy; {new Date().getFullYear()} {site.name} Counseling. Protected
            under the Philippine Data Privacy Act ({site.privacyLaw}).
          </p>
          <p className="tabular-nums">
            Set in Zodiak &amp; Host Grotesk &bull; Manila Time (UTC+8)
          </p>
        </div>
      </div>
    </footer>
  );
}
