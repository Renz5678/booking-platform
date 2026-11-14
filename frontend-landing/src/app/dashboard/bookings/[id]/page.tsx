"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import RescheduleModal from "@/components/dashboard/RescheduleModal";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import type { Booking } from "@/types";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

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

function downloadIcs(booking: Booking) {
  const formatIcsDate = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const counselor =
    booking.counselor_name ||
    booking.counselor?.user?.full_name ||
    "Alaga Counselor";
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alaga Counseling//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${booking.id}@alaga`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(booking.scheduled_start)}`,
    `DTEND:${formatIcsDate(booking.scheduled_end)}`,
    `SUMMARY:Alaga Counseling Session with ${counselor}`,
    `DESCRIPTION:${booking.meeting_link ? `Join link: ${booking.meeting_link}` : "Private counseling session"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `alaga-session-${booking.id.slice(0, 8)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ClientBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params.id;
  const { toast, confirm } = useToast();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);

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

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setProofFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File is too large. Please upload an image or PDF under 5 MB.");
      e.target.value = "";
      setProofFile(null);
      return;
    }
    setProofFile(file);
  };

  const handleUploadProof = async (e: FormEvent) => {
    e.preventDefault();
    if (!booking || !proofFile) {
      toast.error("Please select a payment receipt file first.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", proofFile);
      await api.post(`/payments/${booking.id}/proof`, formData);
      toast.success(
        "Payment proof uploaded! Your counselor will verify it shortly."
      );
      setProofFile(null);
      await loadBooking();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Failed to upload payment proof.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = async () => {
    if (!booking) return;
    const ok = await confirm({
      title: "Cancel this session?",
      message:
        "Are you sure you want to cancel this booking? This action cannot be undone.",
      confirmText: "Cancel Session",
      cancelText: "Keep Booking",
      variant: "danger",
    });
    if (!ok) return;

    setCancelling(true);
    try {
      await api.post(`/bookings/${booking.id}/cancel`);
      toast.success("Booking cancelled.");
      await loadBooking();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Unable to cancel booking.";
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["client"]}>
      <DashboardLayout role="client">
        <div className="space-y-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-primary"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px]"
            >
              arrow_back
            </span>
            <span>Back to Dashboard</span>
          </Link>

          {loading ? (
            <div className="h-72 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated" />
          ) : !booking ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center">
              <p className="text-sm text-text-secondary">
                Booking not found or you do not have permission to view it.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Main Booking Info */}
              <div className="space-y-6 lg:col-span-7">
                <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                        Booking #{booking.id.slice(0, 8)}
                      </p>
                      <h1 className="mt-1 font-serif text-2xl font-medium text-text-primary">
                        Session with{" "}
                        {booking.counselor_name ||
                          booking.counselor?.user?.full_name ||
                          "Licensed Counselor"}
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
                      <dt className="text-xs text-text-muted">
                        Payment Status
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium capitalize text-text-primary">
                        {booking.payment?.status || "Awaiting proof"}
                      </dd>
                    </div>
                  </dl>

                  {booking.status === "confirmed" && (
                    <div className="mt-6 flex flex-wrap gap-3 border-t border-border-subtle pt-5">
                      {booking.meeting_link && (
                        <a
                          href={booking.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover"
                        >
                          <span
                            aria-hidden="true"
                            className="material-symbols-outlined text-[18px]"
                          >
                            videocam
                          </span>
                          <span>Join Google Meet</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => downloadIcs(booking)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted"
                      >
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[16px]"
                        >
                          download
                        </span>
                        <span>Download .ics</span>
                      </button>
                    </div>
                  )}

                  {(booking.status === "pending_payment" ||
                    booking.status === "confirmed") && (
                    <div className="mt-5 flex flex-wrap gap-3 border-t border-border-subtle pt-5">
                      <button
                        type="button"
                        onClick={() => setShowReschedule(true)}
                        className="rounded-xl border border-border-subtle bg-background px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted"
                      >
                        Reschedule Session
                      </button>
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={handleCancel}
                        className="rounded-xl border border-status-danger/30 bg-status-danger-bg px-4 py-2 text-xs font-semibold text-status-danger transition-colors hover:bg-status-danger hover:text-white disabled:opacity-50"
                      >
                        {cancelling ? "Cancelling…" : "Cancel Booking"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Intake Summary */}
                {booking.intake_form && (
                  <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
                    <h2 className="font-serif text-lg font-medium text-text-primary">
                      Your Intake Notes
                    </h2>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-text-muted">
                          Focus / Concern
                        </dt>
                        <dd className="mt-0.5 text-text-primary">
                          {booking.intake_form.concern_category}
                        </dd>
                      </div>
                      {booking.intake_form.notes && (
                        <div>
                          <dt className="text-xs font-medium text-text-muted">
                            Additional Notes
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

              {/* Payment Proof Column */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
                  <h2 className="font-serif text-xl font-medium text-text-primary">
                    Payment Proof
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Upload a screenshot or PDF of your GCash / bank transfer
                    receipt (max 5 MB).
                  </p>

                  {booking.payment?.proof_url && (
                    <div className="mt-4 rounded-xl border border-status-success/30 bg-status-success-bg p-4 text-xs text-status-success">
                      <p className="font-semibold">
                        Payment proof has been submitted.
                      </p>
                      <a
                        href={booking.payment.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block font-medium underline"
                      >
                        View uploaded receipt
                      </a>
                    </div>
                  )}

                  {booking.status === "pending_payment" && (
                    <form onSubmit={handleUploadProof} className="mt-5 space-y-4">
                      <div>
                        <label
                          htmlFor="payment-proof-input"
                          className="block text-xs font-semibold uppercase tracking-wider text-text-muted"
                        >
                          Select Receipt File
                        </label>
                        <input
                          id="payment-proof-input"
                          type="file"
                          accept="image/*,.pdf"
                          onChange={handleFileChange}
                          className="mt-2 block w-full rounded-xl border border-border-subtle bg-background p-2.5 text-xs text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                        />
                        {proofFile && (
                          <p className="mt-2 text-xs text-text-secondary tabular-nums">
                            Selected: <strong>{proofFile.name}</strong> (
                            {(proofFile.size / 1024).toFixed(0)} KB)
                          </p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={uploading || !proofFile}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {uploading ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                            />
                            <span>Uploading…</span>
                          </>
                        ) : (
                          <span>Upload Payment Proof</span>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {showReschedule && booking && (
          <RescheduleModal
            booking={booking}
            onClose={() => setShowReschedule(false)}
            onSuccess={loadBooking}
          />
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
