"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchSiteContentMap } from "@/lib/content";

interface FaqItem {
  question: string;
  answer: string;
}

const DEFAULT_FAQS: FaqItem[] = [
  {
    question: "How do I book a counseling session on Alaga?",
    answer:
      "You can browse our directory of verified counselors freely. When you are ready to view live weekly time slots and book a session, sign in or create a free client account, pick an available slot in Philippine Time (UTC+8), and complete a brief intake note.",
  },
  {
    question: "Are all counselors on Alaga licensed?",
    answer:
      "Yes. Every mental health professional on Alaga submits their valid PRC license and credentials for verification by our team before their profile goes live.",
  },
  {
    question: "How does payment and confirmation work?",
    answer:
      "After submitting a booking request, you can upload your proof of payment directly from your booking details page. Your counselor will review and verify the payment, after which your session is confirmed.",
  },
  {
    question: "Can I reschedule or cancel my session?",
    answer:
      "Yes. From your Client Dashboard, you can reschedule an upcoming session to another open slot or cancel it ahead of time. We encourage updating your booking early out of respect for your counselor's schedule.",
  },
  {
    question: "Is my personal information and intake form confidential?",
    answer:
      "Absolutely. Alaga adheres to the Philippine Data Privacy Act (RA 10173). Your intake notes and personal details are shared only with your chosen counselor to help them prepare for your session.",
  },
  {
    question: "What if I am experiencing an immediate mental health crisis?",
    answer:
      "Alaga is designed for scheduled counseling and is not an emergency service. If you or someone you know is in immediate danger, please call the National Center for Mental Health (NCMH) Crisis Hotline at 1553 or 0917-899-8727, or go to the nearest emergency room.",
  },
];

export default function FaqPage() {
  const [faqs, setFaqs] = useState<FaqItem[]>(DEFAULT_FAQS);
  const [searchQuery, setSearchQuery] = useState("");
  const [openIndices, setOpenIndices] = useState<Record<number, boolean>>({
    0: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadFaqs = async () => {
      try {
        const contentMap = await fetchSiteContentMap();
        const faqRaw = contentMap.faq || contentMap.faq_entries;
        if (faqRaw && active) {
          const parsed = JSON.parse(faqRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed
              .map(
                (f: {
                  q?: string;
                  a?: string;
                  question?: string;
                  answer?: string;
                  category?: string;
                }) => ({
                  question: f.q || f.question || "",
                  answer: f.a || f.answer || "",
                })
              )
              .filter(
                (f) => f.question.trim().length > 0 && f.answer.trim().length > 0
              );
            if (normalized.length > 0) {
              setFaqs(normalized);
            }
          }
        }
      } catch {
        // Keep fallback FAQs
      } finally {
        if (active) setLoading(false);
      }
    };
    loadFaqs();
    return () => {
      active = false;
    };
  }, []);

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (item) =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
    );
  }, [faqs, searchQuery]);

  const toggleItem = (index: number) => {
    setOpenIndices((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <div className="bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="text-label-md uppercase tracking-wider text-primary">
            Help &amp; Guidance
          </span>
          <h1 className="mt-2 font-serif text-headline-xl text-text-primary">
            Frequently Asked Questions
          </h1>
          <p className="mt-3 text-body-md text-text-secondary">
            Clear answers about booking, privacy, payments, and how sessions
            work on Alaga.
          </p>
        </div>

        {/* Search Filter */}
        <div className="mt-8">
          <label htmlFor="faq-search" className="sr-only">
            Search frequently asked questions
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-text-muted"
            >
              search
            </span>
            <input
              id="faq-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search questions (e.g., payment, privacy, reschedule)…"
              className="w-full rounded-xl border border-border-subtle bg-surface-elevated py-3 pl-11 pr-4 text-sm text-text-primary placeholder:text-text-muted shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </div>

        {/* Accordion List */}
        <div className="mt-8 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-16 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated"
                />
              ))}
            </div>
          ) : filteredFaqs.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center">
              <p className="text-sm font-medium text-text-primary">
                No questions matched &ldquo;{searchQuery}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-3 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                Clear search
              </button>
            </div>
          ) : (
            filteredFaqs.map((faq, idx) => {
              const isOpen = !!openIndices[idx];
              const panelId = `faq-panel-${idx}`;
              return (
                <div
                  key={`${faq.question}-${idx}`}
                  className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated shadow-ambient transition-shadow hover:shadow-ambient-hover"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleItem(idx)}
                    className="flex min-h-[52px] w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span className="text-sm font-semibold text-text-primary sm:text-base">
                      {faq.question}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`material-symbols-outlined shrink-0 text-[20px] text-primary transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      expand_more
                    </span>
                  </button>
                  {isOpen && (
                    <div
                      id={panelId}
                      className="border-t border-border-subtle px-6 py-4 text-body-md text-text-secondary animate-fade-in"
                    >
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Support CTA */}
        <div className="mt-12 rounded-2xl border border-border-subtle bg-secondary-container/40 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl font-medium text-text-primary">
              Still have questions?
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Reach out to our care support team and we&apos;ll be glad to help.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/contact"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-primary-hover active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Contact Us
            </Link>
            <Link
              href="/counselors"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated px-5 py-2.5 text-sm font-semibold text-text-primary transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-surface-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Browse Counselors
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
