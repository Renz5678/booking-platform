"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getCaptchaToken } from "@/lib/captcha";
import { validatePasswordStrength } from "@/lib/validation";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [website, setWebsite] = useState(""); // Honeypot
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing or invalid password reset token.");
      return;
    }
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const captchaToken = await getCaptchaToken("reset_password");
      await api.post("/auth/reset-password", {
        token,
        new_password: newPassword,
        website,
        captcha_token: captchaToken,
      });
      router.push("/login?reset=true");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Invalid or expired password reset link.");
      } else {
        setError("Unable to reset password right now. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-border-subtle bg-surface-elevated p-7 sm:p-9 shadow-ambient">
      <div className="text-center">
        <Link
          href="/"
          className="inline-block font-serif text-3xl font-medium tracking-tight text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          Alaga
        </Link>
        <h1 className="mt-3 font-serif text-2xl font-medium text-text-primary">
          Choose a new password
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Enter a strong new password for your Alaga account.
        </p>
      </div>

      {!token && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-status-warning/30 bg-status-warning-bg px-4 py-3 text-xs font-medium text-status-warning"
        >
          No reset token found in this URL. Please use the exact link from your
          email or request a new one.
        </div>
      )}

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

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="hidden" aria-hidden="true">
          <label htmlFor="reset-website">Website</label>
          <input
            id="reset-website"
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
            htmlFor="reset-new-password"
            className="block text-sm font-medium text-text-primary"
          >
            New Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="reset-new-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-xl border border-border-subtle bg-background py-2.5 pl-4 pr-11 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[18px]"
              >
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Include at least 8 characters, one uppercase, one lowercase, and one
            number.
          </p>
        </div>

        <div>
          <label
            htmlFor="reset-confirm-password"
            className="block text-sm font-medium text-text-primary"
          >
            Confirm New Password
          </label>
          <input
            id="reset-confirm-password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !token}
          className="mt-2 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {isLoading ? "Resetting…" : "Reset Password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link
            href="/login"
            className="inline-flex min-h-[44px] md:min-h-[32px] items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1.5 py-1"
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

        <Suspense
          fallback={
            <div className="h-96 animate-pulse rounded-3xl border border-border-subtle bg-surface-elevated" />
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
