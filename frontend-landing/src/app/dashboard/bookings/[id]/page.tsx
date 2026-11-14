"use client";

import { useEffect, useState, use, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api, ApiError, API_BASE_URL } from "@/lib/api";
import Link from "next/link";
import type { BookingRecord, ClientPaymentState } from "@/lib/contracts";
import type { Booking } from "@/types";
import RescheduleModal from "@/components/dashboard/RescheduleModal";

export default function ClientBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [claimState, setClaimState] = useState<ClientPaymentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchBooking = useCallback(async () => {
    try {
      const [bookingData, claimsData] = await Promise.all([
        api.get<BookingRecord>(`/bookings/${resolvedParams.id}`),
        api.get<ClientPaymentState>(`/payments/manual/${resolvedParams.id}/claims`).catch(() => null),
      ]);
      setBooking(bookingData);
      setClaimState(claimsData);
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: "error", text: "Failed to load booking details." });
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    void fetchBooking();
  }, [fetchBooking]);

  const handleConfirmCancel = async () => {
    setCancelling(true);
    setStatusMessage(null);
    try {
      if (!booking?.id) return;
      await api.post(`/bookings/${booking.id}/cancel`, {});
      setShowCancelModal(false);
      setStatusMessage({ type: "success", text: "Booking has been cancelled." });
      await fetchBooking();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setStatusMessage({ type: "error", text: `Failed to cancel booking: ${msg}` });
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!booking?.id) return;
    setDownloadingReceipt(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${booking.id}/receipt`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to download receipt");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt_${booking.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: "error", text: "Failed to download receipt." });
    } finally {
      setDownloadingReceipt(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="client" allowedRoles={["client"]}>
        <div className="animate-pulse space-y-4 max-w-3xl mx-auto">
          <div className="h-8 bg-surface-variant w-1/3 rounded"></div>
          <div className="h-48 bg-surface-variant rounded-xl"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!booking) {
    return (
      <DashboardLayout role="client" allowedRoles={["client"]}>
        <div className="text-center p-8">
          <p className="text-error font-medium">Booking not found.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-primary hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const now = new Date();
  const sessionStart = new Date(booking.scheduled_start);
  const sessionEnd = new Date(booking.scheduled_end);
  const hasStarted = sessionStart <= now;
  const isConfirmed = booking.status === "confirmed";

  // Google Calendar Link
  const gcalFormat = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const text = encodeURIComponent(`Counseling Session with ${booking.counselor_name || "Counselor"}`);
  const dates = `${gcalFormat(sessionStart)}/${gcalFormat(sessionEnd)}`;
  const meetLink = booking.meeting_link;
  const details = encodeURIComponent(meetLink ? `Join here: ${meetLink}` : "Details pending.");
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`;

  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-primary hover:underline font-label-lg">
          <span className="material-symbols-outlined">arrow_back</span> Back to Dashboard
        </Link>

        {statusMessage && (
          <div
            role={statusMessage.type === "error" ? "alert" : "status"}
            className={`p-4 rounded-xl text-sm font-medium ${
              statusMessage.type === "error"
                ? "bg-error-container text-on-error-container"
                : "bg-secondary-container text-on-secondary-container"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h1 className="font-headline-xl text-primary">Booking Session</h1>
            <p className="font-body-lg text-on-surface-variant">with {booking.counselor_name || "Assigned Counselor"}</p>
          </div>
          <div className="bg-surface-container px-4 py-2 rounded-lg text-on-surface font-label-md uppercase tracking-wider font-bold">
            {booking.status.replace("_", " ")}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Schedule Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest space-y-4">
            <h2 className="font-headline-md text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">calendar_today</span>
              Schedule
            </h2>
            <div className="space-y-2 font-body-md text-sm">
              <p>
                <strong className="text-on-surface-variant w-24 inline-block">Start:</strong>{" "}
                {sessionStart.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)
              </p>
              <p>
                <strong className="text-on-surface-variant w-24 inline-block">End:</strong>{" "}
                {sessionEnd.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {meetLink && (
                <a
                  href={meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full bg-primary text-on-primary px-4 py-3 rounded-lg font-label-lg hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined">videocam</span>
                  Join Video Session
                </a>
              )}

              <div className="flex gap-2">
                <a
                  href={`${API_BASE_URL}/bookings/${booking.id}/ics`}
                  className="flex-1 bg-surface-container-high text-on-surface text-center px-4 py-2 rounded-lg font-label-md hover:bg-surface-container-highest transition-colors text-sm"
                >
                  Download .ics
                </a>
                <a
                  href={gcalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-surface-container-high text-on-surface text-center px-4 py-2 rounded-lg font-label-md hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-1 text-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">calendar_add_on</span> Add to GCal
                </a>
              </div>
            </div>
          </div>

          {/* Intake & Receipt Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="font-headline-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">description</span>
                Intake Summary
              </h2>
              <div>
                <strong className="text-on-surface-variant block mb-1 text-xs uppercase tracking-wider">Concern Category:</strong>
                <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm inline-block">
                  {booking.intake_form?.concern_category || "Not specified"}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-outline-variant">
              {booking.status === "confirmed" || booking.status === "completed" ? (
                <button
                  onClick={handleDownloadReceipt}
                  disabled={downloadingReceipt}
                  className="inline-flex items-center gap-2 text-tertiary hover:underline font-label-md disabled:opacity-50 text-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  {downloadingReceipt ? "Downloading Receipt..." : "Download Payment Receipt"}
                </button>
              ) : booking.status === "pending_payment" ? (
                <Link
                  href={`/payment/success?booking_id=${booking.id}`}
                  className="inline-flex items-center gap-2 text-primary hover:underline font-label-md text-sm font-semibold"
                >
                  <span className="material-symbols-outlined text-[18px]">payments</span>
                  View Payment &amp; Instructions
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* Payment & Claims History Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest space-y-4">
          <h2 className="font-headline-md text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary">paid</span>
            Payment &amp; Verification Status
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm bg-surface-container-low p-4 rounded-xl">
            <div>
              <span className="text-on-surface-variant text-xs block">Amount</span>
              <span className="font-bold text-base text-primary">
                ₱{Number(claimState?.amount || booking.payment?.amount || 0).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-on-surface-variant text-xs block">Current State</span>
              <span className="font-semibold text-base uppercase tracking-wider text-primary">
                {(claimState?.state || booking.payment?.status || booking.status).replace("_", " ")}
              </span>
            </div>
            {claimState?.review_deadline && (
              <div>
                <span className="text-on-surface-variant text-xs block">Review Deadline</span>
                <span className="font-semibold text-sm">
                  {new Date(claimState.review_deadline).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                </span>
              </div>
            )}
          </div>

          {/* Refund Details if any */}
          {(claimState?.refund || booking.payment?.refunded_at) && (
            <div className="bg-surface-container p-4 rounded-xl text-sm space-y-1">
              <span className="font-bold text-primary block">Refund Information</span>
              <p>Status: {claimState?.refund?.status || booking.payment?.status}</p>
              {claimState?.refund?.amount && <p>Amount: ₱{Number(claimState.refund.amount).toFixed(2)}</p>}
              {(claimState?.refund?.completed_at || booking.payment?.refunded_at) && (
                <p>
                  Completed:{" "}
                  {new Date(claimState?.refund?.completed_at || booking.payment!.refunded_at!).toLocaleString("en-PH", {
                    timeZone: "Asia/Manila",
                  })}
                </p>
              )}
            </div>
          )}

          {/* Submitted Claims History */}
          <div>
            <h3 className="font-bold text-sm text-primary mb-2">Submitted GCash References</h3>
            {claimState?.claims && claimState.claims.length > 0 ? (
              <div className="space-y-2">
                {claimState.claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex justify-between items-center border border-outline-variant rounded-lg p-3 text-xs bg-surface"
                  >
                    <div>
                      <span className="font-mono font-bold text-primary">{claim.reference}</span>
                      <span className="text-on-surface-variant ml-3">
                        Submitted: {new Date(claim.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                      </span>
                    </div>
                    <span className="bg-surface-container px-2.5 py-0.5 rounded text-xs font-semibold uppercase">
                      {claim.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : booking.payment?.transaction_reference ? (
              <div className="border border-outline-variant rounded-lg p-3 text-xs bg-surface flex justify-between">
                <span className="font-mono font-bold text-primary">{booking.payment.transaction_reference}</span>
                <span className="bg-surface-container px-2 py-0.5 rounded uppercase font-semibold">
                  {booking.payment.status}
                </span>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant italic">No transaction references submitted yet.</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {(isConfirmed || booking.status === "pending_payment") && !hasStarted && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
            <h2 className="font-headline-md text-primary mb-4">Session Actions</h2>
            <div className="flex gap-4">
              <button
                onClick={() => setReschedulingBooking(booking as unknown as Booking)}
                className="bg-secondary text-on-secondary px-6 py-2.5 rounded-lg font-label-md hover:opacity-90 font-bold text-sm"
              >
                Reschedule
              </button>
              <button
                onClick={() => setShowCancelModal(true)}
                className="bg-error-container text-on-error-container px-6 py-2.5 rounded-lg font-label-md hover:opacity-90 font-bold text-sm"
              >
                Cancel Session
              </button>
            </div>
          </div>
        )}

        {/* Cancel Modal */}
        {showCancelModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-booking-title"
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          >
            <div className="bg-surface rounded-xl p-6 max-w-md w-full shadow-lg border border-outline-variant space-y-4">
              <h3 id="cancel-booking-title" className="font-bold text-lg text-primary">
                Confirm Cancellation
              </h3>
              <p className="text-sm text-on-surface-variant">
                Are you sure you want to cancel this booking session with {booking.counselor_name || "your counselor"}?
                If you have completed payment, our team will process your refund according to our cancellation policy.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="border rounded-lg px-4 py-2 text-sm hover:bg-surface-container"
                >
                  Keep Booking
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={cancelling}
                  className="bg-error-container text-on-error-container rounded-lg px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {reschedulingBooking && (
        <RescheduleModal
          booking={reschedulingBooking}
          onClose={() => setReschedulingBooking(null)}
          onSuccess={() => {
            setReschedulingBooking(null);
            void fetchBooking();
          }}
        />
      )}
    </DashboardLayout>
  );
}
