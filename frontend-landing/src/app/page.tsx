"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/routes";
import type { CounselorProfile } from "@/types";

interface Quote {
  text: string;
  author: string;
}

const DEFAULT_QUOTES: Quote[] = [
  {
    text: "Healing is not linear, and you do not have to carry everything on your own. Taking the first step to talk is already an act of courage.",
    author: "Alaga Clinical Team",
  },
  {
    text: "A safe, confidential space allows you to slow down, untangle your thoughts, and rebuild clarity at your own pace.",
    author: "Dr. Elena Santos, RPsy",
  },
  {
    text: "Care that respects your culture, your story, and your privacy — accessible from wherever you feel most comfortable.",
    author: "Alaga Counseling Care",
  },
];

const FALLBACK_COUNSELORS: Array<{
  id: string;
  name: string;
  title: string;
  specializations: string[];
  bio: string;
  rate?: number;
  photo_url?: string | null;
  isLive?: boolean;
}> = [
  {
    id: "featured-1",
    name: "Dr. Elena Santos",
    title: "Licensed Clinical Psychologist",
    specializations: ["Anxiety", "Trauma", "Life Transitions"],
    bio: "Specializing in evidence-based CBT and trauma-informed care for young adults and working professionals.",
    isLive: false,
  },
  {
    id: "featured-2",
    name: "Marcus Reyes, RGC",
    title: "Registered Guidance Counselor",
    specializations: ["Stress & Burnout", "Career", "Relationships"],
    bio: "Helping individuals navigate workplace burnout, family dynamics, and personal boundaries with practical tools.",
    isLive: false,
  },
  {
    id: "featured-3",
    name: "Sofia Villanueva, RPsy",
    title: "Licensed Psychologist",
    specializations: ["Depression", "Grief", "Mindfulness"],
    bio: "Compassionate, culturally grounded therapy focused on emotional resilience, self-compassion, and recovery.",
    isLive: false,
  },
];

export default function HomePage() {
  const [quotes, setQuotes] = useState<Quote[]>(DEFAULT_QUOTES);
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [counselors, setCounselors] = useState<typeof FALLBACK_COUNSELORS>(
    FALLBACK_COUNSELORS
  );

  useEffect(() => {
    let active = true;

    const loadContent = async () => {
      try {
        const res = await api.get<{
          items?: Array<{ key: string; value: string }>;
        }>("/admin/content");
        const quoteBlock = res?.items?.find((i) => i.key === "homepage_quotes");
        if (quoteBlock && active) {
          const parsed = JSON.parse(quoteBlock.value);
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
            list.slice(0, 3).map((c) => ({
              id: c.id,
              name: c.user?.full_name || "Licensed Counselor",
              title: "Licensed Mental Health Professional",
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
        // Keep curated fallback cards
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

  const activeQuote = quotes[currentQuoteIndex] || DEFAULT_QUOTES[0];

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-background pt-14 pb-20 sm:pt-20 sm:pb-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-0 h-96 w-96 rounded-full bg-primary/5 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 left-0 h-80 w-80 rounded-full bg-secondary-container/40 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-4 py-1.5 text-xs font-medium text-primary shadow-sm">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[16px]"
              >
                verified_user
              </span>
              <span>PRC-Licensed Professionals &bull; Confidential Care</span>
            </div>

            <h1 className="font-serif text-headline-xl text-text-primary">
              A calm, private space to talk with someone who{" "}
              <span className="italic text-primary">truly listens.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-body-lg text-text-secondary">
              Connect with vetted, licensed Filipino counselors and psychologists
              online. Browse verified profiles, schedule at your own pace, and
              receive thoughtful support from the comfort of home.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
              <Link
                href="/counselors"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto"
              >
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-elevated px-7 py-3.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto"
              >
                <span>How It Works</span>
              </a>
            </div>

            {/* Trust Strip */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[16px] text-primary"
                >
                  lock
                </span>
                RA 10173 Data Privacy Compliant
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[16px] text-primary"
                >
                  calendar_month
                </span>
                Manila Time (UTC+8) Scheduling
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[16px] text-primary"
                >
                  videocam
                </span>
                Private 1-on-1 Online Sessions
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Quote Carousel Section */}
      <section
        aria-label="Reflections on mental wellness"
        className="border-y border-border-subtle bg-surface-elevated py-14"
      >
        <div
          className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8"
          onMouseEnter={() => setIsCarouselPaused(true)}
          onMouseLeave={() => setIsCarouselPaused(false)}
          onFocus={() => setIsCarouselPaused(true)}
          onBlur={() => setIsCarouselPaused(false)}
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined mb-3 text-3xl text-primary/40"
          >
            format_quote
          </span>
          <blockquote aria-live="polite" className="min-h-[5.5rem]">
            <p className="font-serif text-xl leading-relaxed text-text-primary sm:text-2xl">
              &ldquo;{activeQuote.text}&rdquo;
            </p>
            <footer className="mt-4 text-sm font-medium text-text-secondary">
              &mdash; {activeQuote.author}
            </footer>
          </blockquote>

          {quotes.length > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                aria-label="Previous quote"
                onClick={() =>
                  setCurrentQuoteIndex(
                    (prev) => (prev - 1 + quotes.length) % quotes.length
                  )
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[18px]"
                >
                  chevron_left
                </span>
              </button>

              <div className="flex items-center gap-1.5">
                {quotes.map((q, idx) => (
                  <button
                    key={`${q.author}-${idx}`}
                    type="button"
                    aria-label={`Show quote ${idx + 1} of ${quotes.length}`}
                    aria-pressed={idx === currentQuoteIndex}
                    onClick={() => setCurrentQuoteIndex(idx)}
                    className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      idx === currentQuoteIndex
                        ? "w-6 bg-primary"
                        : "w-2 bg-border-strong hover:bg-text-muted"
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                aria-label="Next quote"
                onClick={() =>
                  setCurrentQuoteIndex((prev) => (prev + 1) % quotes.length)
                }
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[18px]"
                >
                  chevron_right
                </span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="scroll-mt-20 bg-background py-20 sm:py-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-label-md uppercase tracking-wider text-primary">
              Simple &amp; Guided
            </span>
            <h2 className="mt-2 font-serif text-headline-lg text-text-primary">
              How booking with Alaga works
            </h2>
            <p className="mt-3 text-body-md text-text-secondary">
              Designed to remove friction so you can focus on getting the
              support you deserve.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: "person_search",
                title: "Explore Verified Counselors",
                desc: "Filter by specialization, read clinical backgrounds, and find a licensed professional whose approach fits your needs.",
              },
              {
                step: "02",
                icon: "event_available",
                title: "Sign In & Pick a Time",
                desc: "Create a free account to view live weekly availability in Philippine Time and share brief intake notes securely.",
              },
              {
                step: "03",
                icon: "verified",
                title: "Confirm & Meet Online",
                desc: "Upload your payment proof, receive confirmation from your counselor, and join your private session link on schedule.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-border-subtle bg-surface-elevated p-7 shadow-ambient transition-shadow hover:shadow-ambient-hover"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[22px]"
                    >
                      {item.icon}
                    </span>
                  </div>
                  <span className="font-serif text-2xl font-medium text-border-strong tabular-nums">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-5 font-headline-sm text-text-primary">
                  {item.title}
                </h3>
                <p className="mt-2 text-body-md text-text-secondary">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Professionals */}
      <section className="border-t border-border-subtle bg-surface-elevated py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="text-label-md uppercase tracking-wider text-primary">
                Our Care Team
              </span>
              <h2 className="mt-2 font-serif text-headline-lg text-text-primary">
                Meet our licensed professionals
              </h2>
              <p className="mt-2 max-w-xl text-body-md text-text-secondary">
                Every practitioner on Alaga is vetted for active PRC
                credentials and clinical experience.
              </p>
            </div>
            <Link
              href="/counselors"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg px-2 py-1"
            >
              <span>View all counselors</span>
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[18px]"
              >
                arrow_forward
              </span>
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {counselors.map((c) => {
              const targetHref = c.isLive
                ? `/counselors/${c.id}`
                : "/counselors";
              return (
                <Link
                  key={c.id}
                  href={targetHref}
                  className="group flex flex-col justify-between rounded-2xl border border-border-subtle bg-background p-6 shadow-ambient transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-ambient-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div>
                    <div className="flex items-center gap-4">
                      {c.photo_url ? (
                        <img
                          src={c.photo_url}
                          alt={c.name}
                          className="h-14 w-14 rounded-full object-cover border border-border-subtle"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-light font-serif text-lg font-semibold text-primary">
                          {getInitials(c.name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-text-primary group-hover:text-primary transition-colors">
                          {c.name}
                        </h3>
                        <p className="truncate text-xs text-text-muted">
                          {c.title}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {c.specializations.map((spec) => (
                        <span
                          key={spec}
                          className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-text-secondary"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>

                    <p className="mt-4 line-clamp-3 text-body-sm text-text-secondary">
                      {c.bio}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-border-subtle pt-4 text-sm">
                    {typeof c.rate === "number" ? (
                      <span className="font-semibold text-text-primary tabular-nums">
                        &#8369;{c.rate.toLocaleString()}{" "}
                        <span className="font-normal text-text-muted">
                          / hr
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-text-muted">
                        Verified Practitioner
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      <span>View profile</span>
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5"
                      >
                        arrow_forward
                      </span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="scroll-mt-20 bg-background py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-10 rounded-3xl border border-border-subtle bg-secondary-container/35 p-8 sm:p-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <span className="text-label-md uppercase tracking-wider text-primary">
                About Alaga
              </span>
              <h2 className="mt-2 font-serif text-headline-lg text-text-primary">
                Thoughtful mental healthcare, built with warmth and privacy.
              </h2>
              <p className="mt-4 text-body-md text-text-secondary">
                &ldquo;Alaga&rdquo; means care. We built this platform so
                individuals across the Philippines can find trustworthy,
                licensed mental health professionals without overwhelming
                directories, hidden steps, or clinical coldness.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Create Free Account
                </Link>
                <Link
                  href="/faq"
                  className="inline-flex items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Read Common Questions
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-5">
              {[
                {
                  icon: "shield_lock",
                  title: "Strict Privacy",
                  body: "Intake notes and session details remain strictly between you and your counselor.",
                },
                {
                  icon: "schedule",
                  title: "Flexible Rescheduling",
                  body: "Life happens. Reschedule directly from your client dashboard when plans shift.",
                },
                {
                  icon: "badge",
                  title: "Verified Licenses",
                  body: "Every counselor submits PRC documentation reviewed by our clinical team.",
                },
                {
                  icon: "support_agent",
                  title: "Human Support",
                  body: "Need help finding a match or confirming payment? Reach us anytime.",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-border-subtle bg-surface-elevated p-5"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-primary text-[22px]"
                  >
                    {card.icon}
                  </span>
                  <h3 className="mt-2.5 text-sm font-semibold text-text-primary">
                    {card.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">
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
