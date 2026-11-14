"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { setToken(new URLSearchParams(location.search).get("token") || ""); history.replaceState(null, "", location.pathname); }, []);
  return <form className="max-w-md mx-auto p-8 space-y-5" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api.post("/auth/password-reset/confirm", { token, new_password: password }); setDone(true); setMessage("Password reset. Sign in with your new password."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}><h1 className="text-2xl font-bold">Reset password</h1>{!done && <><label className="block">New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} className="block border p-3" /></label><p>Use uppercase and lowercase letters and a number. Maximum 72 UTF-8 bytes.</p><button disabled={busy || !token} className="border p-3">Save password</button></>}<p role="status">{message}</p><Link href="/login">Sign in</Link> · <Link href="/forgot-password">Request a new link</Link></form>;
}
