"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function MFAPage() {
  const router = useRouter();
  const { checkAuth } = useAuth();
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    await checkAuth();
    const user = await api.get("/auth/me");
    router.replace(user.role === "admin" ? "/admin/dashboard" : "/counselor/dashboard");
  };
  const enroll = async () => {
    setBusy(true); setError("");
    try { const result = await api.post("/auth/mfa/enroll"); setSecret(result.secret); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api.post("/auth/mfa/verify", { code });
      setCode(""); setSecret("");
      if (result.recovery_codes) setRecovery(result.recovery_codes); else await finish();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <main className="max-w-lg mx-auto p-8 space-y-5">
    <h1 className="text-2xl font-bold">Staff security verification</h1>
    {error && <p role="alert">{error}</p>}
    {recovery.length ? <>
      <p>Save these recovery codes somewhere safe. Each code works once. They will not be shown again.</p>
      <pre className="p-4 border rounded">{recovery.join("\n")}</pre>
      <button className="border rounded p-3" onClick={finish}>I saved my codes — continue</button>
    </> : <>
      <p>Enter the six-digit code from your authenticator app, or an unused recovery code.</p>
      <button className="border rounded p-3" disabled={busy} onClick={enroll}>Set up an authenticator for the first time</button>
      {secret && <div className="space-y-2"><p>Add a time-based account named Alaga in your authenticator app using this setup key, then enter its code below.</p><code className="break-all">{secret}</code></div>}
      <form onSubmit={verify} className="space-y-4">
        <label className="block">Verification or recovery code<input className="block border rounded p-3 w-full" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" maxLength={64} required /></label>
        <button className="border rounded p-3" disabled={busy}>{busy ? "Verifying…" : "Verify"}</button>
      </form>
    </>}
    <p>If your challenge expires, sign in again. Contact your administrator if you have lost your authenticator and recovery codes.</p>
  </main>;
}
