"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { DetailPageSkeleton } from "@/components/ui/LoadingState";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import { isBookingPast } from "@/lib/bookingTime";
import type { Booking } from "@/types";

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

export default function CounselorBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params.id;
  const { toast, confirm } = useToast();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadBooking = useCallback(async () => {
    try {
      const data = await api.get<Booking>(`/bookings/${bookingId}`);
      setBooking(data);
    } catch {
      toast.error("Unable to load booking details.");
    } finally {
      setLoading(false);
    }
  }, [bookingId, toast]);

  useEffect(() => {
    loadBooking();
  }, [loadBooking]);

  const handleVerifyPayment = async () => {
    if (!booking) return;
    const ok = await confirm({
      title: "Verify payment & confirm session?",
      message:
        "Confirming payment will mark this booking as Confirmed and notify the client.",
      confirmText: "Verify & Confirm",
      cancelText: "Review Again",
    });
    if (!ok) return;

    setBusyAction("verify");
    try {
      await api.post(`/payments/${booking.id}/verify`);
      toast.success("Payment verified and session confirmed.");
      await loadBooking();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to verify payment.";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRejectPayment = async () => {
    if (!booking) return;
    const ok = await confirm({
      title: "Reject payment proof?",
      message:
        "The client will be asked to re-upload a valid payment receipt.",
      confirmText: "Reject Proof",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    setBusyAction("reject");
    try {
      await api.post(`/payments/${booking.id}/reject`);
      toast.info("Payment proof rejected.");
      await loadBooking();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to reject payment.";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateStatus = async (status: "completed" | "no_show") => {
    if (!booking) return;
    const label = status === "completed" ? "Completed" : "No Show";
    const ok = await confirm({
      title: `Mark session as ${label}?`,
      message: `Are you sure you want to update this booking status to ${label}?`,
      confirmText: `Mark ${label}`,
      cancelText: "Cancel",
    });
    if (!ok) return;

    setBusyAction(status);
    try {
      await api.put(`/bookings/${booking.id}/status`, { status });
      toast.success(`Session marked as ${label}.`);
      await loadBooking();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Unable to update status.";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCounselorCancel = async () => {
    if (!booking) return;
    const ok = await confirm({
      title: "Cancel this client session?",
      message:
        "Are you sure you want to cancel this session? The client will be notified.",
      confirmText: "Cancel Session",
      cancelText: "Keep Session",
      variant: "danger",
    });
    if (!ok) return;

    setBusyAction("cancel");
    try {
      await api.post(`/bookings/${booking.id}/counselor-cancel`);
      toast.success("Session cancelled.");
      await loadBooking();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Unable to cancel session.";
      toast.error(msg);
    } finally {
      setBusyAction(null);
    }
  };

  const clientName =
    booking?.client_name || booking?.client?.full_name || "Client";

  return (
    <ProtectedRoute allowedRoles={["counselor"]}>
      <DashboardLayout role="counselor">
        <div className="space-y-6">
          <Link
            href="/counselor/bookings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-primary"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px]"
            >
              arrow_back
            </span>
            <span>Back to Bookings</span>
          </Link>

          {loading ? (
            <DetailPageSkeleton label="Loading session details…" />
          ) : !booking ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center">
              <p className="text-sm text-text-secondary">Booking not found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-7">
                <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                        Booking #{booking.id.slice(0, 8)}
                      </p>
                      <h1 className="mt-1 font-serif text-2xl font-medium text-text-primary">
                        {clientName}
                      </h1>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                        booking.status === "confirmed"
                          ? "bg-status-success-bg text-status-success"
                          : booking.status === "pending_payment"
                            ? "bg-status-warning-bg text-status-warning"
                            : booking.status === "cancelled"
                              ? "bg-status-danger-bg text-status-danger"
                              : "bg-surface-muted text-text-secondary"
                      }`}
                    >
                      {booking.status.replace("_", " ")}
                    </span>
                  </div>

                  <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border-subtle pt-5 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-text-muted">Start Time</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-text-primary tabular-nums">
                        {formatManilaDateTime(booking.scheduled_start)} PHT
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">End Time</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-text-primary tabular-nums">
                        {formatManilaDateTime(booking.scheduled_end)} PHT
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Session Fee</dt>
                      <dd className="mt-0.5 text-base font-semibold text-text-primary tabular-nums">
                        {booking.payment?.amount != null
                          ? `₱${Number(booking.payment.amount).toLocaleString()}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Meet Link</dt>
                      <dd className="mt-0.5 text-sm">
                        {booking.meeting_link ? (
                          isBookingPast(booking.scheduled_end) ? (
                            <span className="text-text-muted">Session ended</span>
                          ) : (
                            <a
                              href={booking.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-primary hover:underline"
                            >
                              Open Google Meet
                            </a>
                          )
                        ) : (
                          <span className="text-text-muted">Not generated</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {booking.status === "confirmed" && (
                    <div className="mt-6 flex flex-wrap gap-2.5 border-t border-border-subtle pt-5">
                      <button
                        type="button"
                        disabled={!!busyAction}
                        onClick={() => handleUpdateStatus("completed")}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                      >
                        Mark Completed
                      </button>
                      <button
                        type="button"
                        disabled={!!busyAction}
                        onClick={() => handleUpdateStatus("no_show")}
                        className="rounded-xl border border-border-subtle bg-background px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted disabled:opacity-50"
                      >
                        Mark No Show
                      </button>
                      {!isBookingPast(booking.scheduled_end) && (
                        <button
                          type="button"
                          disabled={!!busyAction}
                          onClick={handleCounselorCancel}
                          className="rounded-xl border border-status-danger/30 bg-status-danger-bg px-4 py-2 text-xs font-semibold text-status-danger transition-colors hover:bg-status-danger hover:text-white disabled:opacity-50"
                        >
                          Cancel Session
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {booking.intake_form && (
                  <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
                    <h2 className="font-serif text-lg font-medium text-text-primary">
                      Client Intake Information
                    </h2>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-text-muted">
                          Concern Category
                        </dt>
                        <dd className="mt-0.5 text-text-primary">
                          {booking.intake_form.concern_category}
                        </dd>
                      </div>
                      {booking.intake_form.notes && (
                        <div>
                          <dt className="text-xs font-medium text-text-muted">
                            Notes
                          </dt>
                          <dd className="mt-0.5 whitespace-pre-line text-text-primary">
                            {booking.intake_form.notes}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>

              {/* Payment Verification */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
                  <h2 className="font-serif text-xl font-medium text-text-primary">
                    Payment Verification
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Verify the client&apos;s uploaded proof before confirming
                    the session.
                  </p>

                  {booking.payment?.proof_url ? (
                    <div className="mt-4 space-y-4">
                      <a
                        href={booking.payment.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[18px]"
                        >
                          receipt_long
                        </span>
                        <span>Open Uploaded Receipt</span>
                      </a>

                      {booking.status === "pending_payment" && (
                        <div className="flex flex-wrap items-center gap-2.5 pt-2">
                          {isBookingPast(booking.scheduled_end) ? (
                            <span className="text-xs text-text-muted">
                              Session time has passed — cannot confirm.
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!!busyAction}
                              onClick={handleVerifyPayment}
                              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                            >
                              {busyAction === "verify"
                                ? "Verifying…"
                                : "Verify & Confirm"}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!!busyAction}
                            onClick={handleRejectPayment}
                            className="rounded-xl border border-status-danger/30 bg-status-danger-bg px-4 py-2 text-xs font-semibold text-status-danger transition-colors hover:bg-status-danger hover:text-white disabled:opacity-50"
                          >
                            {busyAction === "reject"
                              ? "Rejecting…"
                              : "Reject Proof"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-xl border border-border-subtle bg-background p-4 text-xs text-text-secondary">
                      No payment proof uploaded yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
