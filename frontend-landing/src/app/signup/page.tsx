"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import { getCaptchaToken } from "@/lib/captcha";
import { validatePasswordStrength } from "@/lib/validation";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const rawRedirect = searchParams.get("redirect");
  const safeRedirect =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : null;

  const [step, setStep] = useState<"register" | "verify">("register");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsLoading(true);
    try {
      const captchaToken = await getCaptchaToken("signup");
      await api.post("/auth/signup", {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        captcha_token: captchaToken,
      });
      toast.info("We sent a 6-digit verification code to your email.");
      setStep("verify");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Unable to create your account.");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await api.post("/auth/verify-otp", {
        email: email.trim(),
        otp: otp.trim(),
      });
      toast.success("Email verified! You can now sign in.");
      const loginUrl = safeRedirect
        ? `/login?verified=true&redirect=${encodeURIComponent(safeRedirect)}`
        : "/login?verified=true";
      router.push(loginUrl);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Invalid or expired verification code.");
      } else {
        setError("Unable to verify code right now.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setResendingOtp(true);
    try {
      await api.post("/auth/resend-otp", { email: email.trim() });
      toast.info("A new 6-digit verification code has been sent to your email.");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Unable to resend verification code.");
      } else {
        setError("Unable to resend verification code right now.");
      }
    } finally {
      setResendingOtp(false);
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
          {step === "register" ? "Create your account" : "Verify your email"}
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          {step === "register"
            ? "Join Alaga to view live counselor availability and book private sessions."
            : `Enter the 6-digit code sent to ${email}.`}
        </p>
      </div>

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

      {step === "register" ? (
        <form onSubmit={handleRegister} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="signup-name"
              className="block text-sm font-medium text-text-primary"
            >
              Full Name
            </label>
            <input
              id="signup-name"
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Dela Cruz"
              className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm font-medium text-text-primary"
            >
              Email Address
            </label>
            <input
              id="signup-email"
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
              htmlFor="signup-password"
              className="block text-sm font-medium text-text-primary"
            >
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="signup-password"
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
              At least 8 characters recommended.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isLoading ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                />
                <span>Creating account…</span>
              </>
            ) : (
              <span>Continue</span>
            )}
          </button>

          <p className="text-center text-xs leading-relaxed text-text-muted">
            By creating an account, you agree to our{" "}
            <Link
              href="/privacy-policy"
              className="font-medium text-primary hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            under RA 10173.
          </p>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="signup-otp"
              className="block text-sm font-medium text-text-primary"
            >
              6-Digit Verification Code
            </label>
            <input
              id="signup-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-3 text-center font-mono text-xl tracking-[0.4em] text-text-primary placeholder:text-text-muted tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || otp.length < 6}
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isLoading ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                />
                <span>Verifying…</span>
              </>
            ) : (
              <span>Verify &amp; Continue</span>
            )}
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={resendingOtp || isLoading}
              onClick={handleResendOtp}
              className="inline-flex min-h-[44px] md:min-h-[32px] items-center text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {resendingOtp ? "Sending new code…" : "Resend Verification Code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("register");
                setError(null);
              }}
              className="inline-flex min-h-[44px] md:min-h-[32px] items-center text-xs font-medium text-text-secondary hover:text-primary"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 border-t border-border-subtle pt-5 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link
          href={
            safeRedirect
              ? `/login?redirect=${encodeURIComponent(safeRedirect)}`
              : "/login"
          }
          className="inline-flex min-h-[44px] md:min-h-[32px] items-center font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex min-h-[44px] md:min-h-[32px] items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1.5 py-1"
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
            <div className="rounded-3xl border border-border-subtle bg-surface-elevated p-7 sm:p-9">
              <h1 className="font-serif text-headline-lg text-primary">
                Create your Alaga account
              </h1>
              <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-muted" />
            </div>
          }
        >
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
