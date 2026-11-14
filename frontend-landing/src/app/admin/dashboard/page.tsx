"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import type { Booking, CounselorProfile } from "@/types";

interface AnalyticsSummary {
  total_bookings?: number;
  confirmed_bookings?: number;
  total_revenue?: number;
  status_breakdown?: Record<string, number>;
  bookings_by_status?: Record<string, number>;
}

export default function AdminDashboardPage() {
  const { toast, confirm } = useToast();
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [pendingCounselors, setPendingCounselors] = useState<
    CounselorProfile[]
  >([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [stats, pending, bookings] = await Promise.all([
        api.get<AnalyticsSummary>("/admin/analytics"),
        api.get<CounselorProfile[]>("/admin/counselors/pending"),
        api.get<Booking[]>("/admin/bookings"),
      ]);
      setAnalytics(stats);
      setPendingCounselors(Array.isArray(pending) ? pending : []);
      setRecentBookings(
        Array.isArray(bookings) ? bookings.slice(0, 6) : []
      );
    } catch {
      toast.error("Unable to load admin overview.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (counselor: CounselorProfile) => {
    const ok = await confirm({
      title: "Approve counselor?",
      message: `Verify and activate ${
        counselor.user?.full_name || "this counselor"
      } so they appear in the public directory?`,
      confirmText: "Approve & Activate",
      cancelText: "Cancel",
    });
    if (!ok) return;

    setApprovingId(counselor.id);
    try {
      await api.post(`/admin/counselors/${counselor.id}/verify`);
      toast.success("Counselor approved and activated.");
      await loadData();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to approve counselor.";
      toast.error(msg);
    } finally {
      setApprovingId(null);
    }
  };

  const totalBookings = analytics?.total_bookings ?? recentBookings.length;
  const confirmedBookings =
    analytics?.confirmed_bookings ??
    analytics?.status_breakdown?.confirmed ??
    analytics?.bookings_by_status?.confirmed ??
    0;
  const totalRevenue = analytics?.total_revenue ?? 0;

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DashboardLayout role="admin">
        <div className="space-y-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Admin Operations
              </p>
              <h1 className="mt-1 font-serif text-headline-lg text-text-primary">
                Platform Overview
              </h1>
            </div>
            <Link
              href="/admin/counselors"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <span>Manage Counselors</span>
            </Link>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Pending Approvals
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-status-warning tabular-nums">
                {loading ? "—" : pendingCounselors.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Total Bookings
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-text-primary tabular-nums">
                {loading ? "—" : totalBookings}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Confirmed Sessions
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-primary tabular-nums">
                {loading ? "—" : confirmedBookings}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Total Revenue
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-text-primary tabular-nums">
                {loading ? "—" : `₱${Number(totalRevenue).toLocaleString()}`}
              </p>
            </div>
          </div>

          {/* Pending Counselors */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-medium text-text-primary">
                Pending Counselor Applications ({pendingCounselors.length})
              </h2>
              <Link
                href="/admin/counselors"
                className="text-xs font-semibold text-primary hover:underline"
              >
                View all
              </Link>
            </div>

            {loading ? (
              <div className="h-28 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated" />
            ) : pendingCounselors.length === 0 ? (
              <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 text-sm text-text-secondary shadow-ambient">
                All counselor applications are reviewed.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingCounselors.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {c.user?.full_name || "Applicant"}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {c.user?.email} &bull;{" "}
                        {c.credentials_url
                          ? "Credentials uploaded"
                          : "Awaiting credentials"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Link
                        href={`/admin/counselors/${c.id}`}
                        className="rounded-xl border border-border-subtle bg-background px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-surface-muted"
                      >
                        Inspect
                      </Link>
                      <button
                        type="button"
                        disabled={approvingId === c.id}
                        onClick={() => handleApprove(c)}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        {approvingId === c.id ? "Approving…" : "Approve"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Bookings */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-medium text-text-primary">
                Recent Bookings
              </h2>
              <Link
                href="/admin/bookings"
                className="text-xs font-semibold text-primary hover:underline"
              >
                View all bookings
              </Link>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface-elevated shadow-ambient">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-border-subtle bg-surface-muted/60 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Counselor</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {recentBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-background/60">
                      <td className="px-5 py-3 font-medium text-text-primary">
                        {b.client_name || b.client?.full_name || "Client"}
                      </td>
                      <td className="px-5 py-3 text-text-secondary">
                        {b.counselor_name ||
                          b.counselor?.user?.full_name ||
                          "Counselor"}
                      </td>
                      <td className="px-5 py-3 capitalize text-xs font-semibold text-text-secondary">
                        {b.status.replace("_", " ")}
                      </td>
                      <td className="px-5 py-3 font-medium text-text-primary tabular-nums">
                        {b.payment?.amount != null
                          ? `₱${Number(b.payment.amount).toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/bookings/${b.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && recentBookings.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-8 text-center text-sm text-text-muted"
                      >
                        No bookings recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
