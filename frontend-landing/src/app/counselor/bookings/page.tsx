"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import type { Booking } from "@/types";

type FilterTab =
  | "all"
  | "needs_verification"
  | "upcoming"
  | "completed"
  | "cancelled";

function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CounselorBookingsPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("all");

  useEffect(() => {
    let active = true;
    const loadBookings = async () => {
      try {
        const data = await api.get<Booking[]>("/bookings/counselor/me");
        if (active && Array.isArray(data)) {
          setBookings(data);
        }
      } catch {
        if (active) toast.error("Unable to load counselor bookings.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadBookings();
    return () => {
      active = false;
    };
  }, [toast]);

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => {
        if (tab === "needs_verification") return b.status === "pending_payment";
        if (tab === "upcoming") return b.status === "confirmed";
        if (tab === "completed")
          return b.status === "completed" || b.status === "no_show";
        if (tab === "cancelled") return b.status === "cancelled";
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.scheduled_start).getTime() -
          new Date(a.scheduled_start).getTime()
      );
  }, [bookings, tab]);

  const tabs: Array<{ key: FilterTab; label: string }> = [
    { key: "all", label: "All" },
    { key: "needs_verification", label: "Needs Verification" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <ProtectedRoute allowedRoles={["counselor"]}>
      <DashboardLayout role="counselor">
        <div className="space-y-6">
          <div>
            <h1 className="font-serif text-headline-lg text-text-primary">
              Bookings
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Filter sessions by status, review payment proofs, and update
              session outcomes.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Filter bookings by status"
            className="flex flex-wrap gap-2"
          >
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "border border-border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
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
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-10 text-center shadow-ambient">
              <p className="text-sm text-text-secondary">
                No bookings match this filter.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((b) => {
                const clientName =
                  b.client_name || b.client?.full_name || "Client";
                return (
                  <div
                    key={b.id}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-text-primary">
                          {clientName}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            b.status === "confirmed"
                              ? "bg-status-success-bg text-status-success"
                              : b.status === "pending_payment"
                                ? "bg-status-warning-bg text-status-warning"
                                : b.status === "cancelled"
                                  ? "bg-status-danger-bg text-status-danger"
                                  : "bg-surface-muted text-text-secondary"
                          }`}
                        >
                          {b.status.replace("_", " ")}
                        </span>
                        {b.payment?.proof_url &&
                          b.status === "pending_payment" && (
                            <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-semibold text-primary">
                              Proof Uploaded
                            </span>
                          )}
                      </div>
                      <p className="text-xs text-text-secondary tabular-nums">
                        {formatManilaDateTime(b.scheduled_start)} PHT
                        {b.payment?.amount != null &&
                          ` • ₱${Number(b.payment.amount).toLocaleString()}`}
                      </p>
                    </div>

                    <Link
                      href={`/counselor/bookings/${b.id}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-background px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Open Details
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
