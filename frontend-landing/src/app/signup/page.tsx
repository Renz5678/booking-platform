"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    setVerifying(true);

    try {
      const res = await fetch("http://localhost:8000/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          email, 
          otp
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || "Verification failed");
      }

      router.push("/login?verified=true");
    } catch (err: any) {
      setOtpError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          full_name: fullName, 
          email, 
          password,
          captcha_token: "mock_captcha_token" // Backend expects a captcha token in MVP
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || "Signup failed");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface font-sans text-on-surface min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-tertiary-fixed/20 blur-[100px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-secondary-fixed/10 blur-[80px]"></div>
      </div>
      
      <main className="w-full max-w-[420px] px-4 z-10">
        <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-8 md:p-10 w-full relative">
          <div className="text-center mb-8">
            <h1 className="font-headline-lg text-[32px] leading-[40px] font-bold tracking-tight text-primary">Alaga</h1>
            <p className="text-[16px] leading-[24px] text-on-surface-variant mt-2">Create your account to get started</p>
          </div>

          {/* Toggle Container */}
          <div className="relative flex w-full bg-surface-container-low rounded-lg p-1 mb-8" role="tablist">
            <div 
              className="absolute top-1 left-1 bottom-1 w-[calc(50%-4px)] bg-surface-container-lowest shadow-sm rounded-md transition-transform duration-300 ease-in-out"
              style={{ transform: "translateX(100%)" }}
            ></div>
            <Link 
              href="/login"
              className="flex-1 relative z-10 py-2 text-center text-[14px] font-medium text-on-surface-variant transition-colors" 
              role="tab"
            >
              Log In
            </Link>
            <Link 
              href="/signup"
              className="flex-1 relative z-10 py-2 text-center text-[14px] font-medium text-primary transition-colors" 
              role="tab"
            >
              Sign Up
            </Link>
          </div>

          {success ? (
            <div className="text-center py-6">
              <span className="material-symbols-outlined text-[48px] text-on-tertiary-container mb-4">mark_email_read</span>
              <h2 className="text-[20px] font-semibold text-primary mb-2">Check your email</h2>
              <p className="text-on-surface-variant mb-6">We've sent a 6-digit code to <strong>{email}</strong>. Please enter it below.</p>
              
              <form onSubmit={handleVerifyOtp} className="space-y-5 text-left">
                {otpError && (
                  <div className="bg-error-container text-on-error-container p-3 rounded-lg text-sm text-center">
                    {otpError}
                  </div>
                )}
                <div>
                  <label className="block text-[12px] font-semibold tracking-wider text-on-surface-variant mb-1 ml-1 text-center" htmlFor="otp">6-Digit Code</label>
                  <input 
                    id="otp" 
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full max-w-[200px] mx-auto block bg-surface-container-lowest border border-tertiary-fixed rounded-lg px-4 py-3 text-[24px] tracking-[0.5em] text-center text-on-surface focus:outline-none focus:border-on-tertiary-container focus:ring-1 focus:ring-on-tertiary-container transition-all" 
                    placeholder="------" 
                    required 
                  />
                </div>
                <button
                  type="submit"
                  disabled={verifying || otp.length !== 6}
                  className="w-full bg-primary text-on-primary font-label-md py-3 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex justify-center items-center shadow-sm disabled:opacity-70 disabled:active:scale-100 mt-4"
                >
                  {verifying ? (
                    <div className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-on-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Verifying...
                    </div>
                  ) : "Verify Account"}
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-error-container text-on-error-container p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-[12px] font-semibold tracking-wider text-on-surface-variant mb-1 ml-1" htmlFor="fullName">Full Name</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">person</span>
                  <input 
                    id="fullName" 
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-tertiary-fixed rounded-lg pl-10 pr-4 py-3 text-[16px] text-on-surface focus:outline-none focus:border-on-tertiary-container focus:ring-1 focus:ring-on-tertiary-container transition-all" 
                    placeholder="Juan Dela Cruz" 
                    required 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold tracking-wider text-on-surface-variant mb-1 ml-1" htmlFor="email">Email Address</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">mail</span>
                  <input 
                    id="email" 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-tertiary-fixed rounded-lg pl-10 pr-4 py-3 text-[16px] text-on-surface focus:outline-none focus:border-on-tertiary-container focus:ring-1 focus:ring-on-tertiary-container transition-all" 
                    placeholder="you@example.com" 
                    required 
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[12px] font-semibold tracking-wider text-on-surface-variant mb-1 ml-1" htmlFor="password">Password</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">lock</span>
                  <input 
                    id="password" 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-tertiary-fixed rounded-lg pl-10 pr-4 py-3 text-[16px] text-on-surface focus:outline-none focus:border-on-tertiary-container focus:ring-1 focus:ring-on-tertiary-container transition-all" 
                    placeholder="••••••••" 
                    required 
                  />
                </div>
              </div>

              <div className="bg-surface-container rounded-lg p-3 flex items-start gap-3">
                <span className="material-symbols-outlined text-on-surface-variant text-[20px]">info</span>
                <p className="text-[16px] text-on-surface text-sm">Email verification required to activate your account and book sessions.</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-secondary text-on-secondary font-label-md py-3 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex justify-center items-center shadow-sm disabled:opacity-70 disabled:active:scale-100"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-on-secondary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating account...
                  </div>
                ) : (
                  "Sign Up"
                )}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
