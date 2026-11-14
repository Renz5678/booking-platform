"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // Honeypot
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await api.post("/auth/forgot-password", {
        email: email.trim(),
        website,
        captcha_token: "mock_captcha_token",
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Unable to process your request right now.");
      } else {
        setError("Unable to process your request right now. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px]"
            >
              arrow_back
            </span>
            <span>Back to Sign In</span>
          </Link>
        </div>

        <div className="rounded-3xl border border-border-subtle bg-surface-elevated p-7 sm:p-9 shadow-ambient">
          <div className="text-center">
            <Link
              href="/"
              className="inline-block font-serif text-3xl font-medium tracking-tight text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Alaga
            </Link>
            <h1 className="mt-3 font-serif text-2xl font-medium text-text-primary">
              Reset your password
            </h1>
            <p className="mt-1.5 text-sm text-text-secondary">
              Enter your account email and we&apos;ll send you a reset link if an
              account exists.
            </p>
          </div>

          {submitted ? (
            <div className="mt-6 space-y-5 text-center">
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-status-success/30 bg-status-success-bg px-4 py-3 text-left text-xs font-medium text-status-success"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[18px] shrink-0"
                >
                  mark_email_read
                </span>
                <span>
                  If an account with that email exists, a password reset link
                  has been sent. It will expire in 15 minutes.
                </span>
              </div>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Return to Sign In
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 rounded-xl border border-status-danger/30 bg-status-danger-bg px-4 py-3 text-xs font-medium text-status-danger"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[18px] shrink-0"
                  >
                    error
                  </span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="forgot-website">Website</label>
                  <input
                    id="forgot-website"
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
                    htmlFor="forgot-email"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Email Address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {isLoading ? "Sending link…" : "Send Reset Link"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
