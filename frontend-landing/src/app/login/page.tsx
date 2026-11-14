"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";
import { getDashboardPathForRole } from "@/lib/routes";
import type { User } from "@/types";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { checkAuth } = useAuth();

  const isVerified = searchParams.get("verified") === "true";
  const isReset = searchParams.get("reset") === "true";
  const rawRedirect = searchParams.get("redirect");
  const safeRedirect =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await api.post("/auth/login", {
        email: email.trim(),
        password,
      });

      await checkAuth();
      const me = await api.get<User>("/auth/me");

      if (safeRedirect) {
        router.push(safeRedirect);
      } else {
        router.push(getDashboardPathForRole(me.role));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Invalid email or password.");
      } else {
        setError("Unable to sign in right now. Please try again.");
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
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Sign in to view live availability, manage bookings, or join your
          session.
        </p>
      </div>

      {isVerified && (
        <div
          role="status"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-status-success/30 bg-status-success-bg px-4 py-3 text-xs font-medium text-status-success"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[18px] shrink-0"
          >
            check_circle
          </span>
          <span>
            Your email is verified. Sign in below to access your account.
          </span>
        </div>
      )}

      {isReset && (
        <div
          role="status"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-status-success/30 bg-status-success-bg px-4 py-3 text-xs font-medium text-status-success"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[18px] shrink-0"
          >
            check_circle
          </span>
          <span>
            Your password has been reset. Sign in below with your new password.
          </span>
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

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label
            htmlFor="login-email"
            className="block text-sm font-medium text-text-primary"
          >
            Email Address
          </label>
          <input
            id="login-email"
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
            htmlFor="login-password"
            className="block text-sm font-medium text-text-primary"
          >
            Password
          </label>
          <div className="relative mt-1.5">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
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
          <div className="mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {isLoading ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              />
              <span>Signing in…</span>
            </>
          ) : (
            <span>Sign In</span>
          )}
        </button>
      </form>

      <div className="mt-6 border-t border-border-subtle pt-5 text-center text-sm text-text-secondary">
        New to Alaga?{" "}
        <Link
          href={
            safeRedirect
              ? `/signup?redirect=${encodeURIComponent(safeRedirect)}`
              : "/signup"
          }
          className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          Create a free account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
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
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
