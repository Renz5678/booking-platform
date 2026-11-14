"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import RescheduleModal from "@/components/dashboard/RescheduleModal";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import { getTimeBasedGreeting } from "@/lib/routes";
import type { Booking } from "@/types";

function formatManilaDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatManilaTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    });
  return `${fmt(startIso)} – ${fmt(endIso)} PHT`;
}

function StatusBadge({ status }: { status: Booking["status"] }) {
  const styles: Record<string, string> = {
    confirmed: "bg-status-success-bg text-status-success",
    pending_payment: "bg-status-warning-bg text-status-warning",
    completed: "bg-primary-light text-primary",
    cancelled: "bg-status-danger-bg text-status-danger",
    no_show: "bg-surface-muted text-text-muted",
  };
  const labels: Record<string, string> = {
    confirmed: "Confirmed",
    pending_payment: "Pending Payment",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        styles[status] || "bg-surface-muted text-text-secondary"
      }`}
    >
      {labels[status] || status}
    </span>
  );
}

export default function ClientDashboardPage() {
  const { user } = useAuth();
  const { toast, confirm } = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(
    null
  );
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get<Booking[]>("/bookings/me");
      if (Array.isArray(data)) {
        setBookings(data);
      }
    } catch {
      toast.error("Unable to load your bookings right now.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { upcoming, past } = useMemo(() => {
    const up: Booking[] = [];
    const old: Booking[] = [];
    bookings.forEach((b) => {
      if (b.status === "pending_payment" || b.status === "confirmed") {
        up.push(b);
      } else {
        old.push(b);
      }
    });
    up.sort(
      (a, b) =>
        new Date(a.scheduled_start).getTime() -
        new Date(b.scheduled_start).getTime()
    );
    old.sort(
      (a, b) =>
        new Date(b.scheduled_start).getTime() -
        new Date(a.scheduled_start).getTime()
    );
    return { upcoming: up, past: old };
  }, [bookings]);

  const handleCancel = async (booking: Booking) => {
    const ok = await confirm({
      title: "Cancel this counseling session?",
      message: `Are you sure you want to cancel your session with ${
        booking.counselor_name ||
        booking.counselor?.user?.full_name ||
        "your counselor"
      } on ${formatManilaDate(booking.scheduled_start)}?`,
      confirmText: "Yes, Cancel Session",
      cancelText: "Keep Session",
      variant: "danger",
    });
    if (!ok) return;

    setCancellingId(booking.id);
    try {
      await api.post(`/bookings/${booking.id}/cancel`);
      toast.success("Your session has been cancelled.");
      await fetchData();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to cancel this booking.";
      toast.error(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const firstName = user?.full_name?.split(" ")[0] || "there";
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  return (
    <ProtectedRoute allowedRoles={["client"]}>
      <DashboardLayout role="client">
        <div className="space-y-8">
          {/* Greeting Header */}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Client Workspace
              </p>
              <h1 className="mt-1 font-serif text-headline-lg text-text-primary">
                {getTimeBasedGreeting()}, {firstName}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Manage your upcoming counseling sessions, payment proofs, and
                calendar sync.
              </p>
            </div>
            <Link
              href="/counselors"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[18px]"
              >
                add
              </span>
              <span>Book New Session</span>
            </Link>
          </div>

          {/* Upcoming Sessions */}
          <section aria-labelledby="upcoming-heading" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2
                id="upcoming-heading"
                className="font-serif text-xl font-medium text-text-primary"
              >
                Upcoming Sessions ({upcoming.length})
              </h2>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    className="h-36 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated"
                  />
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-ambient">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-4xl text-primary/50"
                >
                  event_available
                </span>
                <h3 className="mt-3 font-serif text-xl font-medium text-text-primary">
                  No upcoming sessions scheduled
                </h3>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-text-secondary">
                  When you&apos;re ready, browse our verified counselors to
                  schedule a confidential 1-on-1 session.
                </p>
                <Link
                  href="/counselors"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span>Browse Counselors</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {upcoming.map((b) => {
                  const counselorName =
                    b.counselor_name ||
                    b.counselor?.user?.full_name ||
                    "Licensed Counselor";
                  const needsProof =
                    b.status === "pending_payment" && !b.payment?.proof_url;

                  return (
                    <div
                      key={b.id}
                      className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 sm:p-6 shadow-ambient transition-shadow hover:shadow-ambient-hover"
                    >
                      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="text-base font-semibold text-text-primary">
                              Session with {counselorName}
                            </h3>
                            <StatusBadge status={b.status} />
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary tabular-nums">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className="material-symbols-outlined text-[16px] text-primary"
                              >
                                calendar_today
                              </span>
                              {formatManilaDate(b.scheduled_start)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className="material-symbols-outlined text-[16px] text-primary"
                              >
                                schedule
                              </span>
                              {formatManilaTimeRange(
                                b.scheduled_start,
                                b.scheduled_end
                              )}
                            </span>
                            {b.payment?.amount != null && (
                              <span className="font-medium text-text-primary">
                                &#8369;
                                {Number(b.payment.amount).toLocaleString()}
                              </span>
                            )}
                          </div>

                          {needsProof && (
                            <p className="text-xs font-medium text-status-warning">
                              Action needed: Upload your payment proof so your
                              counselor can confirm this slot.
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          {b.status === "confirmed" && b.meeting_link && (
                            <a
                              href={b.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <span
                                aria-hidden="true"
                                className="material-symbols-outlined text-[16px]"
                              >
                                videocam
                              </span>
                              <span>Join Google Meet</span>
                            </a>
                          )}

                          <Link
                            href={`/dashboard/bookings/${b.id}`}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              needsProof
                                ? "bg-primary text-white hover:bg-primary-hover"
                                : "border border-border-subtle bg-background text-text-primary hover:bg-surface-muted"
                            }`}
                          >
                            <span>
                              {needsProof
                                ? "Submit Payment Proof"
                                : "View Details"}
                            </span>
                          </Link>

                          <button
                            type="button"
                            onClick={() => setRescheduleTarget(b)}
                            className="rounded-xl border border-border-subtle bg-background px-3.5 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            Reschedule
                          </button>

                          <button
                            type="button"
                            disabled={cancellingId === b.id}
                            onClick={() => handleCancel(b)}
                            className="rounded-xl border border-status-danger/30 bg-status-danger-bg px-3.5 py-2 text-xs font-semibold text-status-danger transition-colors hover:bg-status-danger hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-danger"
                          >
                            {cancellingId === b.id ? "Cancelling…" : "Cancel"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Past Sessions (Expandable) */}
          {past.length > 0 && (
            <section className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <button
                type="button"
                aria-expanded={showPastSessions}
                onClick={() => setShowPastSessions((prev) => !prev)}
                className="flex w-full items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
              >
                <div>
                  <h2 className="font-serif text-lg font-medium text-text-primary">
                    Past &amp; Cancelled Sessions ({past.length})
                  </h2>
                  <p className="text-xs text-text-muted">
                    View your session history and receipts.
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className={`material-symbols-outlined text-text-muted transition-transform ${
                    showPastSessions ? "rotate-180" : ""
                  }`}
                >
                  expand_more
                </span>
              </button>

              {showPastSessions && (
                <div className="mt-4 divide-y divide-border-subtle border-t border-border-subtle pt-2">
                  {past.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {b.counselor_name ||
                            b.counselor?.user?.full_name ||
                            "Counselor"}
                        </p>
                        <p className="text-xs text-text-secondary tabular-nums">
                          {formatManilaDate(b.scheduled_start)} &bull;{" "}
                          {formatManilaTimeRange(
                            b.scheduled_start,
                            b.scheduled_end
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={b.status} />
                        <Link
                          href={`/dashboard/bookings/${b.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Details
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Google Calendar Sync Card */}
          <section className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[20px]"
                  >
                    event
                  </span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">
                    Google Calendar Sync
                  </h2>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {user?.google_calendar_connected
                      ? "Your Google Calendar is connected. Confirmed sessions appear automatically."
                      : "Connect Google Calendar to automatically add confirmed counseling sessions."}
                  </p>
                </div>
              </div>
              {user?.google_calendar_connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success-bg px-3 py-1 text-xs font-semibold text-status-success">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[15px]"
                  >
                    check_circle
                  </span>
                  Connected
                </span>
              ) : (
                <a
                  href={`${apiBase}/auth/google/login`}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-background px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Connect Google Calendar
                </a>
              )}
            </div>
          </section>
        </div>

        {rescheduleTarget && (
          <RescheduleModal
            booking={rescheduleTarget}
            onClose={() => setRescheduleTarget(null)}
            onSuccess={fetchData}
          />
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
