"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import type { CounselorProfile } from "@/types";

type CounselorTab = "pending" | "active" | "deactivated";

export default function AdminCounselorsPage() {
  const { toast, confirm, promptText } = useToast();
  const [tab, setTab] = useState<CounselorTab>("pending");
  const [counselors, setCounselors] = useState<CounselorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const loadCounselors = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint =
        tab === "pending"
          ? "/admin/counselors/pending"
          : `/admin/counselors?status=${tab}`;
      const data = await api.get<CounselorProfile[]>(endpoint);
      setCounselors(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Unable to load counselors list.");
    } finally {
      setLoading(false);
    }
  }, [tab, toast]);

  useEffect(() => {
    loadCounselors();
  }, [loadCounselors]);

  useEffect(() => {
    if (!showInvite) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !inviting) setShowInvite(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showInvite, inviting]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error("Please provide full name and email.");
      return;
    }

    setInviting(true);
    try {
      await api.post("/admin/counselors/invite", {
        full_name: inviteName.trim(),
        email: inviteEmail.trim(),
      });
      toast.success(`Invitation sent to ${inviteEmail.trim()}.`);
      setInviteName("");
      setInviteEmail("");
      setShowInvite(false);
      await loadCounselors();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to invite counselor.";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleApprove = async (c: CounselorProfile) => {
    const ok = await confirm({
      title: "Approve counselor?",
      message: `Verify and activate ${c.user?.full_name || "this counselor"}?`,
      confirmText: "Approve",
    });
    if (!ok) return;

    setBusyId(c.id);
    try {
      await api.post(`/admin/counselors/${c.id}/verify`);
      toast.success("Counselor approved.");
      await loadCounselors();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to approve."
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (c: CounselorProfile) => {
    const reason = await promptText({
      title: "Reject application",
      message: `Provide a brief reason for rejecting ${
        c.user?.full_name || "this applicant"
      }:`,
      label: "Rejection Reason",
      placeholder: "e.g., PRC license document is unreadable",
      confirmText: "Reject Application",
      variant: "danger",
      required: true,
    });
    if (!reason) return;

    setBusyId(c.id);
    try {
      await api.post(
        `/admin/counselors/${c.id}/reject?reason=${encodeURIComponent(reason)}`
      );
      toast.info("Counselor application rejected.");
      await loadCounselors();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to reject application."
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeactivate = async (c: CounselorProfile) => {
    const ok = await confirm({
      title: "Deactivate counselor?",
      message: `${
        c.user?.full_name || "This counselor"
      } will be hidden from the public directory.`,
      confirmText: "Deactivate",
      variant: "danger",
    });
    if (!ok) return;

    setBusyId(c.id);
    try {
      await api.post(`/admin/counselors/${c.id}/deactivate`);
      toast.success("Counselor deactivated.");
      await loadCounselors();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to deactivate."
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DashboardLayout role="admin">
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="font-serif text-headline-lg text-text-primary">
                Counselors Management
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Invite practitioners, verify PRC credentials, and manage active
                profiles.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[18px]"
              >
                person_add
              </span>
              <span>Invite Counselor</span>
            </button>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Filter counselors by status"
            className="flex flex-wrap gap-2"
          >
            {(["pending", "active", "deactivated"] as CounselorTab[]).map(
              (t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => setTab(t)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      active
                        ? "bg-primary text-white shadow-sm"
                        : "border border-border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-muted"
                    }`}
                  >
                    {t}
                  </button>
                );
              }
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-24 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated"
                />
              ))}
            </div>
          ) : counselors.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-10 text-center shadow-ambient">
              <p className="text-sm text-text-secondary">
                No {tab} counselors found.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {counselors.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient sm:flex-row sm:items-center"
                >
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">
                      {c.user?.full_name || "Counselor"}
                    </h2>
                    <p className="text-xs text-text-secondary">
                      {c.user?.email} &bull;{" "}
                      {c.credentials_url
                        ? "Credentials uploaded"
                        : "No credentials"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/counselors/${c.id}`}
                      className="rounded-xl border border-border-subtle bg-background px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-surface-muted"
                    >
                      Details
                    </Link>

                    {tab === "pending" && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => handleApprove(c)}
                          className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => handleReject(c)}
                          className="rounded-xl border border-status-danger/30 bg-status-danger-bg px-3.5 py-2 text-xs font-semibold text-status-danger hover:bg-status-danger hover:text-white disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {tab === "active" && (
                      <button
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => handleDeactivate(c)}
                        className="rounded-xl border border-status-danger/30 bg-status-danger-bg px-3.5 py-2 text-xs font-semibold text-status-danger hover:bg-status-danger hover:text-white disabled:opacity-50"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invite Modal */}
        {showInvite && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/50 p-4 backdrop-blur-xs animate-fade-in overscroll-contain"
            onClick={(e) => {
              if (e.target === e.currentTarget && !inviting) {
                setShowInvite(false);
              }
            }}
          >
            <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-2xl animate-scale-in">
              <div className="flex items-center justify-between">
                <h2
                  id="invite-modal-title"
                  className="font-serif text-xl font-medium text-text-primary"
                >
                  Invite a Counselor
                </h2>
                <button
                  type="button"
                  aria-label="Close invite dialog"
                  disabled={inviting}
                  onClick={() => setShowInvite(false)}
                  className="rounded-lg p-1.5 text-text-muted hover:bg-surface-muted"
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[20px]"
                  >
                    close
                  </span>
                </button>
              </div>

              <form onSubmit={handleInvite} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="invite-name"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Full Name
                  </label>
                  <input
                    id="invite-name"
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Dr. Maria Clara"
                    className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="invite-email"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Email Address
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="counselor@example.com"
                    className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={inviting}
                    onClick={() => setShowInvite(false)}
                    className="rounded-xl border border-border-subtle bg-background px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                  >
                    {inviting ? "Sending…" : "Send Invitation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
