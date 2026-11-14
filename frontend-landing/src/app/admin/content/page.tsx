"use client";

import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import { invalidateSiteContentCache } from "@/lib/content";

interface QuoteItem {
  text: string;
  author: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

export default function AdminContentPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);

  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [crisisText, setCrisisText] = useState("");

  const [rawQuotes, setRawQuotes] = useState("[]");
  const [rawFaqs, setRawFaqs] = useState("[]");

  const loadContent = useCallback(async () => {
    try {
      const res = await api.get<
        | Array<{ key: string; value: string }>
        | { items?: Array<{ key: string; value: string }> }
      >("/admin/content");
      const items = Array.isArray(res) ? res : res?.items || [];

      const qBlock =
        items.find((i) => i.key === "quotes") ||
        items.find((i) => i.key === "homepage_quotes");
      if (qBlock) {
        setRawQuotes(qBlock.value);
        try {
          const parsed = JSON.parse(qBlock.value);
          if (Array.isArray(parsed)) {
            setQuotes(
              parsed.map(
                (q: { quote?: string; text?: string; author?: string }) => ({
                  text: q.text || q.quote || "",
                  author: q.author || "",
                })
              )
            );
          }
        } catch {
          // keep empty
        }
      }

      const fBlock =
        items.find((i) => i.key === "faq") ||
        items.find((i) => i.key === "faq_entries");
      if (fBlock) {
        setRawFaqs(fBlock.value);
        try {
          const parsed = JSON.parse(fBlock.value);
          if (Array.isArray(parsed)) {
            setFaqs(
              parsed.map(
                (f: {
                  q?: string;
                  a?: string;
                  question?: string;
                  answer?: string;
                }) => ({
                  question: f.question || f.q || "",
                  answer: f.answer || f.a || "",
                })
              )
            );
          }
        } catch {
          // keep empty
        }
      }

      const cBlock =
        items.find((i) => i.key === "crisis_banner") ||
        items.find((i) => i.key === "crisis_banner_text");
      if (cBlock) setCrisisText(cBlock.value);
    } catch {
      toast.error("Unable to load site content.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const saveContentKey = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      await api.put(`/admin/content/${key}`, { value });
      invalidateSiteContentCache();
      toast.success(`Updated ${key.replace(/_/g, " ")}.`);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : `Failed to save ${key}.`;
      toast.error(msg);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DashboardLayout role="admin">
        <div className="space-y-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="font-serif text-headline-lg text-text-primary">
                Site Content
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Edit homepage quotes, FAQ entries, and the crisis banner notice.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!rawMode) {
                  setRawQuotes(JSON.stringify(quotes, null, 2));
                  setRawFaqs(JSON.stringify(faqs, null, 2));
                } else {
                  try {
                    const pq = JSON.parse(rawQuotes);
                    if (Array.isArray(pq)) setQuotes(pq);
                    const pf = JSON.parse(rawFaqs);
                    if (Array.isArray(pf)) setFaqs(pf);
                  } catch {
                    toast.error("Invalid JSON syntax — fix before switching.");
                    return;
                  }
                }
                setRawMode((prev) => !prev);
              }}
              className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-muted"
            >
              {rawMode ? "Switch to Visual Editor" : "Edit Raw JSON"}
            </button>
          </div>

          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated" />
          ) : (
            <div className="space-y-6">
              {/* Crisis Banner */}
              <section className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-xl font-medium text-text-primary">
                    Crisis Banner Text
                  </h2>
                  <button
                    type="button"
                    disabled={savingKey === "crisis_banner"}
                    onClick={() =>
                      saveContentKey("crisis_banner", crisisText)
                    }
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                  >
                    {savingKey === "crisis_banner" ? "Saving…" : "Save"}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={crisisText}
                  onChange={(e) => setCrisisText(e.target.value)}
                  placeholder="In immediate crisis? Call NCMH 1553 or 0917-899-8727 (24/7)."
                  className="w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </section>

              {/* Homepage Quotes */}
              <section className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-xl font-medium text-text-primary">
                    Homepage Quotes
                  </h2>
                  <div className="flex items-center gap-2">
                    {!rawMode && (
                      <button
                        type="button"
                        onClick={() =>
                          setQuotes((prev) => [
                            ...prev,
                            { text: "", author: "" },
                          ])
                        }
                        className="rounded-xl border border-border-subtle bg-background px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-surface-muted"
                      >
                        + Add Quote
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={savingKey === "quotes"}
                      onClick={() =>
                        saveContentKey(
                          "quotes",
                          rawMode
                            ? rawQuotes
                            : JSON.stringify(
                                quotes.map((q) => ({
                                  quote: q.text,
                                  author: q.author,
                                }))
                              )
                        )
                      }
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {savingKey === "quotes" ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>

                {rawMode ? (
                  <textarea
                    rows={8}
                    value={rawQuotes}
                    onChange={(e) => setRawQuotes(e.target.value)}
                    className="w-full rounded-xl border border-border-subtle bg-background p-4 font-mono text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                ) : quotes.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    No custom quotes configured (defaults are shown on the
                    homepage).
                  </p>
                ) : (
                  <div className="space-y-3">
                    {quotes.map((q, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border-subtle bg-background p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-text-muted">
                            Quote #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setQuotes((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="text-xs font-semibold text-status-danger hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={q.text}
                          onChange={(e) =>
                            setQuotes((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, text: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Quote text…"
                          className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-3.5 py-2 text-sm text-text-primary"
                        />
                        <input
                          type="text"
                          value={q.author}
                          onChange={(e) =>
                            setQuotes((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, author: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Author / attribution"
                          className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-3.5 py-2 text-sm text-text-primary"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* FAQ Entries */}
              <section className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-serif text-xl font-medium text-text-primary">
                    FAQ Entries
                  </h2>
                  <div className="flex items-center gap-2">
                    {!rawMode && (
                      <button
                        type="button"
                        onClick={() =>
                          setFaqs((prev) => [
                            ...prev,
                            { question: "", answer: "" },
                          ])
                        }
                        className="rounded-xl border border-border-subtle bg-background px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-surface-muted"
                      >
                        + Add FAQ
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={savingKey === "faq"}
                      onClick={() =>
                        saveContentKey(
                          "faq",
                          rawMode
                            ? rawFaqs
                            : JSON.stringify(
                                faqs.map((f) => ({
                                  q: f.question,
                                  a: f.answer,
                                }))
                              )
                        )
                      }
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {savingKey === "faq" ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>

                {rawMode ? (
                  <textarea
                    rows={10}
                    value={rawFaqs}
                    onChange={(e) => setRawFaqs(e.target.value)}
                    className="w-full rounded-xl border border-border-subtle bg-background p-4 font-mono text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                ) : faqs.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    No custom FAQ entries configured (defaults are shown on
                    /faq).
                  </p>
                ) : (
                  <div className="space-y-3">
                    {faqs.map((faq, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border-subtle bg-background p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-text-muted">
                            FAQ #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setFaqs((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="text-xs font-semibold text-status-danger hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          type="text"
                          value={faq.question}
                          onChange={(e) =>
                            setFaqs((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, question: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Question"
                          className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-3.5 py-2 text-sm text-text-primary"
                        />
                        <textarea
                          rows={3}
                          value={faq.answer}
                          onChange={(e) =>
                            setFaqs((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, answer: e.target.value }
                                  : item
                              )
                            )
                          }
                          placeholder="Answer"
                          className="w-full rounded-xl border border-border-subtle bg-surface-elevated px-3.5 py-2 text-sm text-text-primary"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
