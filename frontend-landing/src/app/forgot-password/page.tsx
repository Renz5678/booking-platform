"use client";
import { useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { api } from "@/lib/api";
import { captchaToken } from "@/lib/captcha";
export default function RecoveryPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { executeRecaptcha } = useGoogleReCaptcha();
  async function submit(purpose: "reset" | "otp") {
    setBusy(true); setMessage("");
    try {
      const captcha_token = await captchaToken(executeRecaptcha, "recovery");
      await api.post(purpose === "reset" ? "/auth/password-reset/request" : "/auth/resend-otp", { email, captcha_token });
      setMessage("If the account is eligible, instructions will be emailed. Check your inbox and spam folder.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="max-w-md mx-auto p-8 space-y-5"><h1 className="text-2xl font-bold">Account recovery</h1><form onSubmit={e => { e.preventDefault(); void submit("reset"); }} className="space-y-4"><label className="block">Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="block border p-3 w-full" /></label><button disabled={busy} className="border p-3">Send password reset link</button><button type="button" disabled={busy || !email} className="border p-3" onClick={() => void submit("otp")}>Resend verification code</button></form><p role="status">{message}</p></div>;
}
