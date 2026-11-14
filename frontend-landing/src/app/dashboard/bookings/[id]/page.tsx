"use client";

import { useEffect, useState, use } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api, ApiError } from "@/lib/api";
import Link from "next/link";
import { Booking } from "@/types";
import RescheduleModal from "@/components/dashboard/RescheduleModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ClientBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "maya" | "card">("gcash");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);

  useEffect(() => {
    fetchBooking();
  }, [resolvedParams.id]);

  const fetchBooking = async () => {
    try {
      const data = await api.get(`/bookings/${resolvedParams.id}`);
      setBooking(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await api.post(`/bookings/${booking.id}/cancel`, {});
      alert("Booking cancelled.");
      fetchBooking();
    } catch (err: unknown) {
      alert(`Failed to cancel booking: ${err instanceof ApiError ? err.message : (err as Error).message}`);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referenceNumber.trim() && !proofFile) {
      alert("Please enter a reference number or attach a receipt.");
      return;
    }
    setSubmittingProof(true);
    try {
      const formData = new FormData();
      if (referenceNumber.trim()) {
        formData.append("reference_number", referenceNumber.trim());
      }
      formData.append("payment_method", paymentMethod);
      if (proofFile) {
        formData.append("file", proofFile);
      }
      const res = await fetch(`${API_URL}/payments/${booking.id}/proof`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || "Failed to submit payment proof");
      }
      setReferenceNumber("");
      setProofFile(null);
      alert("Payment details submitted! Your counselor will verify it shortly.");
      fetchBooking();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to submit payment proof");
    } finally {
      setSubmittingProof(false);
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
          <p className="text-error">Booking not found.</p>
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
  const isPending = booking.status === "pending_payment";
  const paymentDeadline = booking.created_at
    ? new Date(new Date(booking.created_at).getTime() + 60 * 60 * 1000)
    : null;

  // Build Google Calendar Add Link
  const gcalFormat = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const text = encodeURIComponent(`Counseling Session with ${booking.counselor?.user?.full_name || booking.counselor_name}`);
  const dates = `${gcalFormat(sessionStart)}/${gcalFormat(sessionEnd)}`;
  const details = encodeURIComponent(booking.meeting_link ? `Join here: ${booking.meeting_link}` : "Details pending.");
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`;

  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="flex items-center gap-2 text-primary hover:underline mb-6 font-label-lg">
          <span className="material-symbols-outlined">arrow_back</span> Back to Dashboard
        </Link>
        
        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h1 className="font-headline-xl text-primary">Booking Session</h1>
            <p className="font-body-lg text-on-surface-variant">with {booking.counselor?.user?.full_name || booking.counselor_name}</p>
          </div>
          <div className="bg-surface-container px-4 py-2 rounded-lg text-on-surface font-label-md uppercase tracking-wider font-bold">
            {booking.status.replace("_", " ")}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
            <h2 className="font-headline-md text-primary mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">calendar_today</span>
              Schedule
            </h2>
            <div className="space-y-3 font-body-md mb-6">
              <p><strong className="text-on-surface-variant w-24 inline-block">Start:</strong> {sessionStart.toLocaleString()}</p>
              <p><strong className="text-on-surface-variant w-24 inline-block">End:</strong> {sessionEnd.toLocaleString()}</p>
            </div>
            
            <div className="space-y-3">
              {booking.meeting_link && (
                <a 
                  href={booking.meeting_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full bg-primary text-on-primary px-4 py-3 rounded-lg font-label-lg hover:bg-primary/90 transition-colors"
                >
                  <span className="material-symbols-outlined">videocam</span>
                  Join Google Meet
                </a>
              )}
              
              <div className="flex gap-2">
                <a 
                  href={`${API_URL}/bookings/${booking.id}/ics`}
                  className="flex-1 bg-surface-container-high text-on-surface text-center px-4 py-2 rounded-lg font-label-md hover:bg-surface-container-highest transition-colors"
                >
                  Download .ics
                </a>
                <a 
                  href={gcalUrl}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 bg-surface-container-high text-on-surface text-center px-4 py-2 rounded-lg font-label-md hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-[18px]">calendar_add_on</span> Add to GCal
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest flex flex-col justify-between">
            <div>
              <h2 className="font-headline-md text-primary mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">description</span>
                Intake Summary
              </h2>
              <div className="space-y-4 font-body-md">
                <div>
                  <strong className="text-on-surface-variant block mb-1">Concern Category:</strong> 
                  <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm inline-block">
                    {booking.intake_form?.concern_category || "Not specified"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Manual Payment Instructions & Optional Proof */}
        {isPending && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h2 className="font-headline-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">payments</span>
                Payment Instructions (1-Hour Window)
              </h2>
              <span className="font-label-lg font-bold text-primary">
                ₱{Number(booking.payment?.amount ?? 300).toFixed(2)} PHP
              </span>
            </div>

            <p className="font-body-md text-on-surface-variant mb-3">
              Please send your session fee via GCash, Maya, or bank transfer within{" "}
              <strong>1 hour</strong>
              {paymentDeadline ? ` (by ${paymentDeadline.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}
              . Your counselor will verify your payment to confirm the booking and generate your Google Meet link.
            </p>

            {(booking.payment?.provider_payment_id || booking.payment?.proof_url) && (
              <div className="bg-secondary-container/40 border border-secondary/30 rounded-lg p-4 mb-4 space-y-2">
                <p className="font-label-md text-primary font-bold">
                  Submitted Payment Details — Awaiting Counselor Verification
                </p>
                {booking.payment?.provider_payment_id && (
                  <p className="font-body-sm text-on-surface">
                    Reference No.: <strong>{booking.payment.provider_payment_id}</strong>
                    {booking.payment.payment_method ? ` (${booking.payment.payment_method.toUpperCase()})` : ""}
                  </p>
                )}
                {booking.payment?.proof_url && (
                  <a
                    href={booking.payment.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-primary font-label-sm underline"
                  >
                    View Uploaded Receipt
                  </a>
                )}
              </div>
            )}

            <form onSubmit={handleSubmitProof} className="space-y-4 border-t border-surface-variant pt-4">
              <p className="font-label-md text-on-surface">
                Optional: Submit your reference number or receipt to help your counselor verify faster
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-sm text-on-surface-variant mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as "gcash" | "maya" | "card")}
                    className="w-full border border-outline-variant rounded-lg p-2.5 font-body-md bg-white"
                  >
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                    <option value="card">Bank Transfer / Card</option>
                  </select>
                </div>
                <div>
                  <label className="block font-label-sm text-on-surface-variant mb-1">
                    Reference Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. 1234 5678 9012"
                    className="w-full border border-outline-variant rounded-lg p-2.5 font-body-md"
                  />
                </div>
              </div>
              <div>
                <label className="block font-label-sm text-on-surface-variant mb-1">
                  Receipt Screenshot / PDF (Optional, max 5MB)
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  className="w-full font-body-sm text-on-surface-variant"
                />
              </div>
              <button
                type="submit"
                disabled={submittingProof}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
              >
                {submittingProof ? "Submitting..." : "Submit Payment Proof"}
              </button>
            </form>
          </div>
        )}

        {/* Action Buttons */}
        {(isPending || (isConfirmed && !hasStarted)) && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
            <h2 className="font-headline-md text-primary mb-4">Session Actions</h2>
            <div className="flex gap-4">
              {isConfirmed && (
                <button 
                  onClick={() => setReschedulingBooking(booking)}
                  className="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label-md hover:opacity-90"
                >
                  Reschedule
                </button>
              )}
              <button 
                onClick={handleCancel}
                className="bg-error-container text-on-error-container px-6 py-2 rounded-lg font-label-md hover:opacity-90"
              >
                Cancel Session
              </button>
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
            fetchBooking();
          }}
        />
      )}
    </DashboardLayout>
  );
}
