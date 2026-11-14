"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QuietRoomCanvas from "@/components/QuietRoomCanvas";
import {
  careSteps,
  defaultQuotes,
  fallbackCounselors,
  trustCommitments,
  type FeaturedCounselor,
  type QuoteItem,
} from "@/data/site";
import { api } from "@/lib/api";
import { fetchSiteContentMap } from "@/lib/content";
import { getInitials } from "@/lib/routes";
import type { CounselorProfile } from "@/types";

export default function HomePage() {
  const [quotes, setQuotes] = useState<QuoteItem[]>(defaultQuotes);
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [counselors, setCounselors] =
    useState<FeaturedCounselor[]>(fallbackCounselors);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let active = true;

    const loadContent = async () => {
      try {
        const contentMap = await fetchSiteContentMap();
        const quoteRaw = contentMap.homepage_quotes || contentMap.quotes;
        if (quoteRaw && active) {
          const parsed = JSON.parse(quoteRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setQuotes(parsed);
          }
        }
      } catch {
        // Keep default quotes
      }

      try {
        const list = await api.get<CounselorProfile[]>("/counselors/");
        if (active && Array.isArray(list) && list.length > 0) {
          setCounselors(
            list.slice(0, 4).map((c) => ({
              id: c.id,
              name: c.user?.full_name || "Licensed Counselor",
              title: "Licensed Mental Health Professional",
              credential: "PRC Verified",
              specializations:
                c.specialization_tags && c.specialization_tags.length > 0
                  ? c.specialization_tags.slice(0, 3)
                  : ["General Counseling"],
              bio:
                c.bio ||
                "Dedicated to providing warm, evidence-based, and confidential mental health support.",
              photo_url: c.photo_url,
              isLive: true,
            }))
          );
        }
      } catch {
        // Keep curated fallback practitioners
      }
    };

    loadContent();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (quotes.length <= 1 || isCarouselPaused) return;
    const timer = setInterval(() => {
      setCurrentQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [quotes.length, isCarouselPaused]);

  const activeQuote = quotes[currentQuoteIndex] || defaultQuotes[0];
  const activeCounselor = counselors[activeIndex] || counselors[0];

  return (
    <div className="flex flex-col">
      {/* 1. Asymmetric Quiet Room Hero */}
      <section className="relative overflow-hidden border-b border-outline-variant bg-background">
        <QuietRoomCanvas />

        <div className="relative z-10 mx-auto max-w-container-max px-4 pt-12 pb-16 sm:pt-20 sm:pb-24 md:px-margin-desktop">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
            {/* Left 8 cols: Display statement + actions */}
            <div className="lg:col-span-8 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">
                  Online Counseling &bull; Philippines
                </p>

                <h1 className="mt-5 font-serif text-[clamp(2.65rem,1.45rem+5.2vw,5.25rem)] leading-[0.98] tracking-[-0.03em] text-primary">
                  A quiet room to talk with someone who truly listens.
                </h1>

                <p className="mt-7 max-w-[48ch] text-body-lg text-on-surface-variant">
                  Connect with vetted, PRC-licensed Filipino counselors and
                  psychologists online. Read their clinical backgrounds, choose
                  an hour in Manila Time, and meet one-on-one from home.
                </p>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-5">
                <Link
                  href="/counselors"
                  data-fill
                  className="btn-fill inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-on-primary"
                >
                  <span className="btn__fill" aria-hidden="true" />
                  <span>Browse Counselors</span>
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[18px]"
                  >
                    arrow_forward
                  </span>
                </Link>

                <a
                  href="#how-it-works"
                  className="inline-link inline-flex min-h-[44px] items-center py-2 text-sm font-semibold text-primary"
                >
                  How booking works
                </a>
              </div>
            </div>

            {/* Right 4 cols: Architectural ledger */}
            <aside
              aria-label="Platform standards"
              className="lg:col-span-4 lg:border-l lg:border-outline-variant lg:pl-8 flex flex-col justify-between gap-8 pt-6 border-t border-outline-variant lg:border-t-0 lg:pt-0"
            >
              <div>
                <p className="font-serif italic text-xl text-primary">
                  Pag-aalaga
                </p>
                <p className="mt-2 text-body-sm text-on-surface-variant leading-relaxed">
                  In Tagalog, &ldquo;alaga&rdquo; means to tend to someone with
                  steady attention and care. Everything here is built to feel
                  like a calm room, never a noisy directory.
                </p>
              </div>

              <dl className="divide-y divide-outline-variant border-y border-outline-variant text-sm">
                <div className="flex items-center justify-between py-3">
                  <dt className="text-on-surface-variant">Practitioners</dt>
                  <dd className="font-semibold text-primary">PRC-Licensed</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-on-surface-variant">Scheduling</dt>
                  <dd className="font-semibold text-primary tabular-nums">
                    Manila (UTC+8)
                  </dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-on-surface-variant">Privacy</dt>
                  <dd className="font-semibold text-primary tabular-nums">
                    RA 10173
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </div>
      </section>

      {/* 2. Reflections Chapter (Full-bleed Ink Band) */}
      <section
        aria-label="Reflections on mental wellness"
        className="bg-primary text-on-primary py-16 sm:py-24"
      >
        <div
          className="mx-auto max-w-container-max px-4 md:px-margin-desktop"
          onMouseEnter={() => setIsCarouselPaused(true)}
          onMouseLeave={() => setIsCarouselPaused(false)}
          onFocus={() => setIsCarouselPaused(true)}
          onBlur={() => setIsCarouselPaused(false)}
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-fixed-dim">
                Reflections
              </span>
              <p className="mt-2 font-serif text-lg tabular-nums text-primary-fixed">
                {String(currentQuoteIndex + 1).padStart(2, "0")} /{" "}
                {String(quotes.length).padStart(2, "0")}
              </p>
            </div>

            <div className="lg:col-span-8">
              <blockquote aria-live="polite" className="min-h-[6.5rem]">
                <p className="font-serif italic text-[clamp(1.45rem,1.1rem+1.4vw,2.25rem)] leading-[1.3] text-on-primary">
                  &ldquo;{activeQuote.text}&rdquo;
                </p>
                <footer className="mt-5 text-sm font-medium text-primary-fixed-dim">
                  {activeQuote.author}
                </footer>
              </blockquote>
            </div>

            {quotes.length > 1 && (
              <div className="lg:col-span-2 flex items-center justify-start lg:justify-end gap-2">
                <button
                  type="button"
                  aria-label="Previous quote"
                  onClick={() =>
                    setCurrentQuoteIndex(
                      (prev) => (prev - 1 + quotes.length) % quotes.length
                    )
                  }
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-on-primary transition-all hover:-translate-x-0.5 hover:bg-white/10"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[18px]"
                  >
                    arrow_back
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Next quote"
                  onClick={() =>
                    setCurrentQuoteIndex((prev) => (prev + 1) % quotes.length)
                  }
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-on-primary transition-all hover:translate-x-0.5 hover:bg-white/10"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[18px]"
                  >
                    arrow_forward
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Interactive Counselor Index (Signature Moment) */}
      <section className="border-b border-outline-variant bg-background py-20 sm:py-28">
        <div className="mx-auto max-w-container-max px-4 md:px-margin-desktop">
          <div className="flex flex-col justify-between gap-4 pb-10 border-b border-outline-variant sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">
                Our Care Team
              </p>
              <h2
                data-split="lines"
                className="mt-2 font-serif text-headline-xl text-primary"
              >
                Meet our licensed practitioners
              </h2>
            </div>

            <Link
              href="/counselors"
              className="inline-link inline-flex w-fit items-center gap-1.5 py-1 text-sm font-semibold text-primary"
            >
              <span>View full directory</span>
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[17px]"
              >
                arrow_forward
              </span>
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left 7 cols: Tactile index rows */}
            <div className="lg:col-span-7 divide-y divide-outline-variant border-b border-outline-variant">
              {counselors.map((c, idx) => {
                const isSelected = idx === activeIndex;
                const targetHref = c.isLive
                  ? `/counselors/${c.id}`
                  : "/counselors";

                return (
                  <div
                    key={c.id}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onFocus={() => setActiveIndex(idx)}
                    className={`group transition-colors duration-300 ${
                      isSelected ? "bg-surface-container-low/70" : ""
                    }`}
                  >
                    <Link
                      href={targetHref}
                      className="flex flex-col gap-4 py-6 px-3 sm:px-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-4 sm:items-center">
                        <span className="mt-1 sm:mt-0 font-mono text-xs text-on-surface-variant tabular-nums">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        {c.photo_url ? (
                          <img
                            src={c.photo_url}
                            alt=""
                            width={44}
                            height={44}
                            aria-hidden="true"
                            className="h-11 w-11 shrink-0 rounded-full object-cover object-top border border-outline-variant"
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-secondary-container font-serif text-sm font-medium text-secondary"
                          >
                            {getInitials(c.name)}
                          </div>
                        )}
                        <div>
                          <div className="flex flex-wrap items-baseline gap-2.5">
                            <h3 className="font-serif text-2xl text-primary transition-transform duration-300 group-hover:translate-x-1">
                              {c.name}
                            </h3>
                            <span className="text-xs font-medium text-secondary">
                              {c.credential}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-on-surface-variant">
                            {c.title} &bull; {c.specializations.join(", ")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 pl-8 sm:pl-0 shrink-0">
                        {typeof c.rate === "number" ? (
                          <span className="text-sm font-semibold text-primary tabular-nums">
                            &#8369;{c.rate.toLocaleString()}
                            <span className="font-normal text-on-surface-variant">
                              /hr
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-on-surface-variant">
                            Private 1-on-1
                          </span>
                        )}
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[20px] text-primary transition-transform duration-300 group-hover:translate-x-1.5"
                        >
                          arrow_forward
                        </span>
                      </div>
                    </Link>

                    {/* Mobile/Tablet inline preview */}
                    <div className="px-3 pb-5 sm:px-4 lg:hidden">
                      <p className="text-sm leading-relaxed text-on-surface-variant line-clamp-2">
                        {c.bio}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {c.specializations.slice(0, 3).map((spec) => (
                          <span
                            key={spec}
                            className="rounded-full border border-outline-variant bg-background px-2.5 py-0.5 text-[11px] font-medium text-primary"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right 5 cols (Desktop): Poised preview frame */}
            <div className="hidden lg:block lg:col-span-5">
              {activeCounselor && (
                <div className="sticky top-[calc(var(--crisis-banner-h,0px)+5.5rem)] border border-outline-variant bg-surface-bright p-8 shadow-ambient">
                  <div className="flex items-start justify-between border-b border-outline-variant pb-5">
                    <div className="flex items-center gap-4">
                      {activeCounselor.photo_url ? (
                        <img
                          src={activeCounselor.photo_url}
                          alt={activeCounselor.name}
                          width={96}
                          height={120}
                          className="w-24 aspect-[4/5] shrink-0 rounded-sm object-cover object-top border border-outline-variant"
                        />
                      ) : (
                        <div className="flex w-24 aspect-[4/5] shrink-0 items-center justify-center rounded-sm border border-outline-variant bg-secondary-container font-serif text-2xl text-secondary">
                          {getInitials(activeCounselor.name)}
                        </div>
                      )}
                      <div>
                        <p className="font-serif text-2xl text-primary">
                          {activeCounselor.name}
                        </p>
                        <p className="text-xs font-medium text-on-surface-variant">
                          {activeCounselor.title}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="mt-6 text-body-md text-on-surface-variant leading-relaxed">
                    {activeCounselor.bio}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {activeCounselor.specializations.map((spec) => (
                      <span
                        key={spec}
                        className="rounded-full border border-outline-variant bg-background px-3 py-1 text-xs font-medium text-primary"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>

                  <div className="mt-8 flex items-center justify-between border-t border-outline-variant pt-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        Session Rate
                      </p>
                      <p className="mt-0.5 font-serif text-xl text-primary tabular-nums">
                        {typeof activeCounselor.rate === "number"
                          ? `₱${activeCounselor.rate.toLocaleString()} / hour`
                          : "Verified Practitioner"}
                      </p>
                    </div>

                    <Link
                      href={
                        activeCounselor.isLive
                          ? `/counselors/${activeCounselor.id}`
                          : "/counselors"
                      }
                      data-fill
                      className="btn-fill inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
                    >
                      <span className="btn__fill" aria-hidden="true" />
                      <span>View profile</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. How Care Unfolds (Asymmetric Sticky Ledger) */}
      <section
        id="how-it-works"
        className="scroll-mt-20 border-b border-outline-variant bg-surface-container-low py-20 sm:py-28"
      >
        <div className="mx-auto max-w-container-max px-4 md:px-margin-desktop">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-[calc(var(--crisis-banner-h,0px)+5.5rem)]">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">
                  Simple &amp; Guided
                </p>
                <h2
                  data-split="lines"
                  className="mt-3 font-serif text-headline-xl text-primary"
                >
                  Three unhurried steps to your first hour.
                </h2>
                <p className="mt-4 text-body-md text-on-surface-variant">
                  Booking support should not feel like navigating a clinic
                  waiting room. Everything from discovery to confirmation is
                  direct and transparent.
                </p>
                <div className="mt-8">
                  <Link
                    href="/counselors"
                    data-fill
                    className="btn-fill btn-fill--outline inline-flex min-h-[44px] items-center gap-2 rounded-full border border-primary px-6 py-3 text-sm font-semibold text-primary"
                  >
                    <span className="btn__fill" aria-hidden="true" />
                    <span>Explore open hours</span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 lg:col-start-6 divide-y divide-outline-variant border-t border-b border-outline-variant">
              {careSteps.map((item) => (
                <div
                  key={item.index}
                  data-reveal="up"
                  className="py-8 sm:py-10 grid grid-cols-1 gap-4 sm:grid-cols-12"
                >
                  <div className="sm:col-span-3">
                    <span className="font-serif text-3xl text-secondary tabular-nums">
                      {item.index}
                    </span>
                    <p className="mt-1 text-xs font-medium text-on-surface-variant">
                      {item.detail}
                    </p>
                  </div>
                  <div className="sm:col-span-9">
                    <h3 className="font-serif text-2xl text-primary">
                      {item.title}
                    </h3>
                    <p className="mt-2.5 text-body-md text-on-surface-variant leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. About / Sanctuary Manifesto (Split Frame) */}
      <section id="about" className="scroll-mt-20 bg-background py-20 sm:py-28">
        <div className="mx-auto max-w-container-max px-4 md:px-margin-desktop">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-6">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">
                About Alaga
              </p>
              <h2
                data-split="lines"
                className="mt-3 font-serif text-headline-xl text-primary"
              >
                Thoughtful mental healthcare, built with warmth and privacy.
              </h2>
              <p className="mt-5 max-w-[50ch] text-body-lg text-on-surface-variant">
                We built Alaga so individuals across the Philippines can find
                trustworthy, PRC-licensed professionals without overwhelming
                directories, hidden steps, or clinical coldness.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-5">
                <Link
                  href="/signup"
                  data-fill
                  className="btn-fill inline-flex min-h-[48px] items-center justify-center rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-on-primary"
                >
                  <span className="btn__fill" aria-hidden="true" />
                  <span>Create Free Account</span>
                </Link>
                <Link
                  href="/faq"
                  className="inline-link inline-flex min-h-[44px] items-center py-2 text-sm font-semibold text-primary"
                >
                  Read common questions
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 border-t border-l border-outline-variant">
              {trustCommitments.map((card) => (
                <div
                  key={card.title}
                  data-reveal="up"
                  className="border-r border-b border-outline-variant bg-surface-bright p-6 sm:p-7"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary">
                    {card.label}
                  </p>
                  <h3 className="mt-2 font-serif text-xl text-primary">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-body-sm text-on-surface-variant leading-relaxed">
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
