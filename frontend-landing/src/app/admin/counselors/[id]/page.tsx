"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import type { CounselorProfile } from "@/types";

export default function AdminCounselorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const counselorId = params.id;
  const { toast, confirm, promptText } = useToast();

  const [counselor, setCounselor] = useState<CounselorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadCounselor = useCallback(async () => {
    try {
      const data = await api.get<CounselorProfile>(
        `/admin/counselors/${counselorId}`
      );
      setCounselor(data);
    } catch {
      toast.error("Unable to load counselor details.");
    } finally {
      setLoading(false);
    }
  }, [counselorId, toast]);

  useEffect(() => {
    loadCounselor();
  }, [loadCounselor]);

  const handleApprove = async () => {
    if (!counselor) return;
    const ok = await confirm({
      title: "Approve counselor?",
      message: `Verify and activate ${
        counselor.user?.full_name || "this counselor"
      }?`,
      confirmText: "Approve & Activate",
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.post(`/admin/counselors/${counselor.id}/verify`);
      toast.success("Counselor approved.");
      await loadCounselor();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to approve.");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!counselor) return;
    const reason = await promptText({
      title: "Reject application",
      message: "Enter a reason for rejecting this application:",
      label: "Reason",
      confirmText: "Reject",
      variant: "danger",
      required: true,
    });
    if (!reason) return;

    setBusy(true);
    try {
      await api.post(
        `/admin/counselors/${counselor.id}/reject?reason=${encodeURIComponent(
          reason
        )}`
      );
      toast.info("Application rejected.");
      router.push("/admin/counselors");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to reject.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    if (!counselor) return;
    const ok = await confirm({
      title: "Deactivate counselor?",
      message: "This counselor will be removed from the public directory.",
      confirmText: "Deactivate",
      variant: "danger",
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.post(`/admin/counselors/${counselor.id}/deactivate`);
      toast.success("Counselor deactivated.");
      await loadCounselor();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to deactivate."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DashboardLayout role="admin">
        <div className="space-y-6">
          <Link
            href="/admin/counselors"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px]"
            >
              arrow_back
            </span>
            <span>Back to Counselors</span>
          </Link>

          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated" />
          ) : !counselor ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center">
              <p className="text-sm text-text-secondary">
                Counselor record not found.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 sm:p-8 shadow-ambient space-y-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h1 className="font-serif text-2xl font-medium text-text-primary">
                    {counselor.user?.full_name || "Counselor"}
                  </h1>
                  <p className="mt-1 text-sm text-text-secondary">
                    {counselor.user?.email}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!counselor.is_verified && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleApprove}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        Approve &amp; Verify
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleReject}
                        className="rounded-xl border border-status-danger/30 bg-status-danger-bg px-4 py-2 text-xs font-semibold text-status-danger hover:bg-status-danger hover:text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {counselor.is_verified && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleDeactivate}
                      className="rounded-xl border border-status-danger/30 bg-status-danger-bg px-4 py-2 text-xs font-semibold text-status-danger hover:bg-status-danger hover:text-white disabled:opacity-50"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-5 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-text-muted">Verification</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-text-primary">
                    {counselor.is_verified ? "Verified" : "Pending"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Account Status</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-text-primary">
                    {counselor.is_active ? "Active" : "Inactive"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Credential File</dt>
                  <dd className="mt-0.5 text-sm">
                    {counselor.credentials_url ? (
                      <a
                        href={counselor.credentials_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary hover:underline"
                      >
                        View Document
                      </a>
                    ) : (
                      <span className="text-text-muted">Not uploaded</span>
                    )}
                  </dd>
                </div>
              </dl>

              {counselor.bio && (
                <div className="border-t border-border-subtle pt-5">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Bio
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">
                    {counselor.bio}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
