"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import { validatePasswordStrength } from "@/lib/validation";

function CounselorSetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const token = searchParams.get("token") || "";
  const initialEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Invalid or missing invitation token.");
      return;
    }
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await api.post("/auth/accept-invite", {
        token,
        email: email.trim(),
        password,
      });
      toast.success("Account activated! Please sign in to complete your profile.");
      router.push("/login?verified=true");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Unable to activate your counselor account.");
      } else {
        setError("An unexpected error occurred. Please try again.");
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
          Counselor Account Setup
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Set your password to activate your practitioner workspace.
        </p>
      </div>

      {!token && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-status-warning/30 bg-status-warning-bg px-4 py-3 text-xs font-medium text-status-warning"
        >
          No invitation token found in this link. Please open the exact
          invitation URL sent to your email.
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
        <div>
          <label
            htmlFor="setup-email"
            className="block text-sm font-medium text-text-primary"
          >
            Invited Email Address
          </label>
          <input
            id="setup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="counselor@example.com"
            className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <div>
          <label
            htmlFor="setup-password"
            className="block text-sm font-medium text-text-primary"
          >
            Create Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="setup-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-xl border border-border-subtle bg-background py-2.5 pl-4 pr-11 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[18px]"
              >
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="setup-confirm-password"
            className="block text-sm font-medium text-text-primary"
          >
            Confirm Password
          </label>
          <input
            id="setup-confirm-password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !token}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {isLoading ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              />
              <span>Activating…</span>
            </>
          ) : (
            <span>Activate Account</span>
          )}
        </button>
      </form>
    </div>
  );
}

export default function CounselorSetupPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px]"
            >
              arrow_back
            </span>
            <span>Back to Home</span>
          </Link>
        </div>

        <Suspense
          fallback={
            <div className="h-96 animate-pulse rounded-3xl border border-border-subtle bg-surface-elevated" />
          }
        >
          <CounselorSetupForm />
        </Suspense>
      </div>
    </div>
  );
}
