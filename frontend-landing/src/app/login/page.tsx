"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Login failed");
      }

      // Login successful, now fetch role
      const meRes = await fetch("http://localhost:8000/auth/me", {
        credentials: "include",
      });
      
      if (!meRes.ok) {
        throw new Error("Failed to fetch user role");
      }
      
      const userData = await meRes.json();
      
      if (userData.role === "client") {
        router.push("/dashboard");
      } else if (userData.role === "counselor") {
        router.push("/counselor/dashboard");
      } else if (userData.role === "admin") {
        router.push("/admin/dashboard");
      }
    } catch (err: unknown) {
      setError((err as Error).message);
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
            <p className="text-[16px] leading-[24px] text-on-surface-variant mt-2">Welcome back to your safe space</p>
          </div>

          {/* Toggle Container */}
          <div className="relative flex w-full bg-surface-container-low rounded-lg p-1 mb-8" role="tablist">
            <div 
              className="absolute top-1 left-1 bottom-1 w-[calc(50%-4px)] bg-surface-container-lowest shadow-sm rounded-md transition-transform duration-300 ease-in-out"
              style={{ transform: "translateX(0)" }}
            ></div>
            <Link 
              href="/login"
              className="flex-1 relative z-10 py-2 text-center text-[14px] font-medium text-primary transition-colors" 
              role="tab"
            >
              Log In
            </Link>
            <Link 
              href="/signup"
              className="flex-1 relative z-10 py-2 text-center text-[14px] font-medium text-on-surface-variant transition-colors" 
              role="tab"
            >
              Sign Up
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-error-container text-on-error-container p-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            
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

            <div className="text-right">
              <a href="#" className="text-[12px] font-semibold text-on-tertiary-container hover:text-tertiary-container transition-colors">Forgot password?</a>
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
                  Logging in...
                </div>
              ) : (
                "Log In"
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
