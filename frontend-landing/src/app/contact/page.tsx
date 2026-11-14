"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import { getCaptchaToken } from "@/lib/captcha";

export default function ContactPage() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // Honeypot
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in your name, email, and message.");
      return;
    }

    setIsSubmitting(true);
    try {
      const captchaToken = await getCaptchaToken("contact");
      await api.post("/contact/", {
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        captcha_token: captchaToken,
        honeypot: website,
      });
      setSubmitted(true);
      toast.success("Message sent! Our team will respond shortly.");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to send your message right now. Please try again.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="text-label-md uppercase tracking-wider text-primary">
            Get in Touch
          </span>
          <h1 className="mt-2 font-serif text-headline-xl text-text-primary">
            We&apos;re here to help you navigate your care.
          </h1>
          <p className="mt-3 text-body-md text-text-secondary">
            Have a question about finding a counselor, verifying a payment, or
            partnering with Alaga? Send us a note below.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Info Column */}
          <div className="space-y-5 lg:col-span-5">
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[20px]"
                  >
                    schedule
                  </span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">
                    Support Hours
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Monday &ndash; Saturday, 8:00 AM &ndash; 6:00 PM (PHT). We
                    typically reply within one business day.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[20px]"
                  >
                    lock
                  </span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">
                    Privacy Reminder
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Please avoid sharing sensitive clinical history in this
                    general inquiry form. Clinical notes are shared securely in
                    your booking intake form.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-status-danger/20 bg-status-danger-bg p-6">
              <div className="flex items-start gap-3.5">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[22px] text-status-danger"
                >
                  emergency
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-status-danger">
                    Need Immediate Crisis Support?
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-text-primary">
                    Call the NCMH Crisis Hotline at{" "}
                    <strong className="tabular-nums">1553</strong> (Luzon
                    landline) or{" "}
                    <strong className="tabular-nums">0917-899-8727</strong>{" "}
                    available 24/7.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Form Column */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 sm:p-8 shadow-ambient">
              {submitted ? (
                <div className="py-8 text-center animate-fade-in">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-success-bg text-status-success">
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[28px]"
                    >
                      check_circle
                    </span>
                  </div>
                  <h2 className="mt-4 font-serif text-2xl font-medium text-text-primary">
                    Thank you for reaching out
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
                    We have received your message and will reply to your email
                    shortly.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSubmitted(false)}
                      className="rounded-xl border border-border-subtle bg-background px-5 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Send Another Message
                    </button>
                    <Link
                      href="/counselors"
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Browse Counselors
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Honeypot field */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="contact-website">Website</label>
                    <input
                      id="contact-website"
                      type="text"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-name"
                      className="block text-sm font-medium text-text-primary"
                    >
                      Full Name
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Juan Dela Cruz"
                      className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-email"
                      className="block text-sm font-medium text-text-primary"
                    >
                      Email Address
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="block text-sm font-medium text-text-primary"
                    >
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      required
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="How can we help you today?"
                      className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    {isSubmitting ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                        />
                        <span>Sending…</span>
                      </>
                    ) : (
                      <>
                        <span>Send Message</span>
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[18px]"
                        >
                          send
                        </span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
