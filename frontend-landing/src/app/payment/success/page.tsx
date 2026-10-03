"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import DashboardLayout from "@/components/layout/DashboardLayout";

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get("booking_id");
  const [status, setStatus] = useState<"loading" | "success" | "error" | "pending">("loading");
  const [booking, setBooking] = useState<any>(null);

  useEffect(() => {
    async function fetchBookingDetails() {
      if (!bookingId) {
        setStatus("error");
        return;
      }

      try {
        const res = await api.get(`/bookings/${bookingId}`);
        setBooking(res);
        if (res.status === "confirmed") {
          setStatus("success");
        } else if (res.status === "cancelled") {
          setStatus("error");
        } else if (res.status === "pending_payment") {
          setStatus("pending");
        }
      } catch (err) {
        console.error("Verification error:", err);
        setStatus("error");
      }
    }

    fetchBookingDetails();
  }, [bookingId]);

  const durationHours = booking 
    ? (new Date(booking.scheduled_end).getTime() - new Date(booking.scheduled_start).getTime()) / (1000 * 60 * 60)
    : 1;
  const amount = durationHours * 300;

  return (
    <div className="max-w-2xl mx-auto mt-16 bg-surface rounded-2xl shadow-ambient p-10 text-center border border-white">
      {status === "loading" && (
        <div className="flex flex-col items-center py-12">
          <div className="w-20 h-20 bg-secondary-container rounded-full flex items-center justify-center mb-8 relative">
            <span className="material-symbols-outlined text-[40px] text-secondary absolute animate-pulse">lock</span>
            <div className="absolute inset-0 border-4 border-secondary rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h2 className="font-headline-lg text-primary mb-3">Loading Booking Details...</h2>
        </div>
      )}
      
      {status === "success" && (
        <div className="flex flex-col items-center py-8">
          <div className="w-24 h-24 bg-[#E8F8F0] rounded-full flex items-center justify-center mb-8 shadow-sm">
            <span className="material-symbols-outlined text-[56px] text-[#138A72]">check_circle</span>
          </div>
          <h2 className="font-display-sm font-bold text-primary mb-4">Payment Confirmed!</h2>
          <p className="font-body-lg text-on-surface-variant mb-10 max-w-md">
            Your session has been successfully booked and confirmed. You will receive an email with your Google Meet link.
          </p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="w-full max-w-sm bg-secondary text-on-secondary font-label-lg font-bold py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-sm"
          >
            Go to My Dashboard
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center py-8">
          <div className="w-24 h-24 bg-error-container rounded-full flex items-center justify-center mb-8 shadow-sm">
            <span className="material-symbols-outlined text-[56px] text-error">error</span>
          </div>
          <h2 className="font-display-sm font-bold text-primary mb-4">Booking Error</h2>
          <p className="font-body-lg text-on-surface-variant mb-10 max-w-md">
            We couldn't verify your booking, or it has been cancelled.
          </p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="w-full max-w-sm border-2 border-outline-variant text-primary font-label-lg font-bold py-4 rounded-xl hover:bg-surface-container-low active:scale-[0.98] transition-all duration-200"
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {status === "pending" && (
        <div className="flex flex-col items-center py-4 text-left">
          <div className="w-full bg-secondary-container p-6 rounded-xl border border-[#CDEAE1] mb-8 flex flex-col items-center text-center">
            <span className="material-symbols-outlined text-[48px] text-secondary mb-4">payments</span>
            <h2 className="font-headline-lg font-bold text-primary mb-2">Complete Your Payment</h2>
            <p className="font-body-md text-on-surface-variant">Please send your payment via GCash within 15 minutes to secure your slot.</p>
          </div>
          
          <div className="w-full bg-surface border border-outline-variant rounded-xl p-6 mb-8">
            <h3 className="font-label-lg font-bold text-primary border-b border-surface-container pb-4 mb-4">GCash Instructions</h3>
            
            <ol className="list-decimal pl-5 space-y-4 font-body-md text-on-surface-variant mb-6">
              <li>Open your GCash app and tap <strong>Send Money</strong> &gt; <strong>Express Send</strong>.</li>
              <li>Send exactly <strong className="text-primary font-bold">₱{amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> to GCash Number: <strong className="text-primary font-bold tracking-wide">0912 345 6789</strong> (Alaga Counseling).</li>
              <li>In the message/notes section, put your Booking ID: <span className="bg-surface-container px-2 py-1 rounded font-mono text-sm text-primary">{bookingId}</span></li>
              <li>Complete the transfer and save the receipt for your records.</li>
            </ol>

            <div className="bg-surface-container p-4 rounded-lg flex items-start gap-3">
              <span className="material-symbols-outlined text-tertiary">info</span>
              <p className="font-label-sm text-on-surface-variant text-sm">Once payment is sent, your counselor will verify it and manually confirm the session. You can track the status on your dashboard.</p>
            </div>
          </div>

          <button 
            onClick={() => router.push("/dashboard")}
            className="w-full border-2 border-primary text-primary font-label-lg font-bold py-4 rounded-xl hover:bg-primary hover:text-on-primary active:scale-[0.98] transition-all duration-200"
          >
            I've Sent the Payment — Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <Suspense fallback={<div className="text-center py-12">Loading...</div>}>
        <SuccessContent />
      </Suspense>
    </DashboardLayout>
  );
}
