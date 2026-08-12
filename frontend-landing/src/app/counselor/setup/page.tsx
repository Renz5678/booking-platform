"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

function SetupForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";
  
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // If we wanted to decode email from token, we could do it on backend, 
  // but let's just let the user provide it if not in params.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invalid invite link. Missing token.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/accept-invite", { token, email, password });
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to accept invite.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-ambient text-center">
        <span className="material-symbols-outlined text-[64px] text-secondary mb-4">check_circle</span>
        <h1 className="font-headline-lg text-primary mb-2">Account Activated!</h1>
        <p className="font-body-md text-on-surface-variant mb-6">Your counselor account is now active. You can log in.</p>
        <Link href="/login" className="bg-primary text-on-primary px-8 py-3 rounded-lg font-label-lg hover:opacity-90 inline-block">
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-ambient max-w-md w-full">
      <div className="text-center mb-8">
        <h1 className="font-headline-lg text-primary mb-2">Welcome to Alaga</h1>
        <p className="font-body-md text-on-surface-variant">Set your password to activate your counselor account.</p>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-lg mb-6 font-body-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-label-md text-on-surface mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
            placeholder="Your email address"
          />
        </div>
        <div>
          <label className="block font-label-md text-on-surface mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
            placeholder="Create a password"
          />
        </div>
        <div>
          <label className="block font-label-md text-on-surface mb-1">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
            placeholder="Confirm your password"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-on-primary px-4 py-3 rounded-lg font-label-lg hover:opacity-90 disabled:opacity-50 mt-6"
        >
          {loading ? "Activating..." : "Activate Account"}
        </button>
      </form>
    </div>
  );
}

export default function CounselorSetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest p-4">
      <Suspense fallback={<div className="animate-pulse bg-white p-8 rounded-xl shadow-ambient w-full max-w-md h-96"></div>}>
        <SetupForm />
      </Suspense>
    </div>
  );
}
