"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { BookingRecord, ClientPaymentState } from "@/lib/contracts";
import { api, ApiError } from "@/lib/api";
import PaymentReferenceForm from "@/components/dashboard/PaymentReferenceForm";
import DashboardLayout from "@/components/layout/DashboardLayout";

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get("booking_id");

  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [claimState, setClaimState] = useState<ClientPaymentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!bookingId) {
      setPageError("No booking ID was provided in the URL.");
      setLoading(false);
      return;
    }

    try {
      setNetworkError(null);
      const [bookingRes, claimsRes] = await Promise.all([
        api.get<BookingRecord>(`/bookings/${bookingId}`),
        api.get<ClientPaymentState>(`/payments/manual/${bookingId}/claims`),
      ]);
      setBooking(bookingRes);
      setClaimState(claimsRes);
      setPageError(null);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 404 || err.status === 403) {
          setPageError("Booking not found or you do not have permission to view it.");
        } else {
          // Temporary server / network issue — do NOT declare payment failure
          setNetworkError("Unable to reach the server to update status. Retrying...");
        }
      } else {
        setNetworkError("Temporary connection issue. Rechecking...");
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void checkStatus();

    // Determine whether to poll based on current state
    const isTerminal =
      claimState &&
      (claimState.meeting_ready ||
        claimState.state === "refunded" ||
        claimState.state === "expired" ||
        (claimState.state === "rejected" && claimState.claims.length >= 5));

    if (isTerminal || pageError) {
      return;
    }

    const interval = setInterval(() => {
      void checkStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [checkStatus, claimState, pageError]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto mt-16 bg-surface rounded-2xl shadow-ambient p-10 text-center border border-outline-variant">
        <div className="flex flex-col items-center py-12">
          <div className="w-20 h-20 bg-secondary-container rounded-full flex items-center justify-center mb-8 relative">
            <span className="material-symbols-outlined text-[40px] text-secondary absolute animate-pulse">lock</span>
            <div className="absolute inset-0 border-4 border-secondary rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h2 className="font-headline-lg text-primary mb-3">Checking Payment Status...</h2>
          <p className="text-on-surface-variant text-sm">Retrieving your latest booking verification records.</p>
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto mt-16 bg-surface rounded-2xl shadow-ambient p-10 text-center border border-outline-variant">
        <div className="flex flex-col items-center py-8">
          <div className="w-24 h-24 bg-error-container rounded-full flex items-center justify-center mb-8 shadow-sm">
            <span className="material-symbols-outlined text-[56px] text-error">error</span>
          </div>
          <h2 className="font-display-sm font-bold text-primary mb-4">Booking Error</h2>
          <p className="font-body-lg text-on-surface-variant mb-10 max-w-md">{pageError}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full max-w-sm border-2 border-outline-variant text-primary font-label-lg font-bold py-4 rounded-xl hover:bg-surface-container-low active:scale-[0.98] transition-all duration-200"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const gcashNumber = booking?.gcash_number || "Payment details unavailable — contact support";
  const gcashName = booking?.gcash_name || "Alaga Counseling";
  const totalAmount = claimState?.amount
    ? Number(claimState.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })
    : booking?.payment?.amount
    ? Number(booking.payment.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })
    : "300.00";

  const currentState = claimState?.state || "awaiting_submission";
  const hasSubmittedClaim = (claimState?.claims && claimState.claims.length > 0) || !!booking?.payment?.transaction_reference;

  return (
    <div className="max-w-2xl mx-auto mt-16 bg-surface rounded-2xl shadow-ambient p-10 text-center border border-outline-variant space-y-6">
      {networkError && (
        <div role="status" className="bg-surface-container-high text-on-surface p-3 rounded-lg text-xs text-left">
          {networkError}
        </div>
      )}

      {/* STATE: PAID & MEETING READY */}
      {currentState === "paid" && claimState?.meeting_ready && (
        <div className="flex flex-col items-center py-4">
          <div className="w-24 h-24 bg-[#E8F8F0] rounded-full flex items-center justify-center mb-6 shadow-sm">
            <span className="material-symbols-outlined text-[56px] text-[#138A72]">check_circle</span>
          </div>
          <h2 className="font-display-sm font-bold text-primary mb-3">Session Confirmed &amp; Ready!</h2>
          <p className="font-body-lg text-on-surface-variant mb-8 max-w-md">
            Your GCash payment has been verified by an administrator and your meeting link is generated.
          </p>
          {booking?.meeting_link && (
            <a
              href={booking.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full max-w-sm bg-primary text-on-primary font-label-lg font-bold py-4 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-sm flex items-center justify-center gap-2 mb-4"
            >
              <span className="material-symbols-outlined">videocam</span>
              Join Video Session
            </a>
          )}
          <button
            onClick={() => router.push(`/dashboard/bookings/${bookingId}`)}
            className="w-full max-w-sm border-2 border-outline-variant text-primary font-label-lg font-bold py-3.5 rounded-xl hover:bg-surface-container-low transition-all"
          >
            View Booking Details
          </button>
        </div>
      )}

      {/* STATE: PAID BUT PROVISIONING PENDING */}
      {currentState === "paid" && !claimState?.meeting_ready && (
        <div className="flex flex-col items-center py-4">
          <div className="w-20 h-20 bg-secondary-container rounded-full flex items-center justify-center mb-6 relative">
            <span className="material-symbols-outlined text-[40px] text-secondary animate-spin">sync</span>
          </div>
          <h2 className="font-display-sm font-bold text-primary mb-3">Payment Verified!</h2>
          <p className="font-body-lg text-on-surface-variant mb-6 max-w-md">
            Your payment is recorded. Meeting link generation is in progress. This page will update automatically when ready.
          </p>
          <button
            onClick={() => router.push(`/dashboard/bookings/${bookingId}`)}
            className="w-full max-w-sm border-2 border-primary text-primary font-label-lg font-bold py-3.5 rounded-xl hover:bg-surface-container-low transition-all"
          >
            Go to Booking Details
          </button>
        </div>
      )}

      {/* STATE: UNDER REVIEW */}
      {currentState === "under_review" && (
        <div className="flex flex-col items-center py-4 text-left space-y-4">
          <div className="w-full bg-secondary-container p-6 rounded-xl border border-[#CDEAE1] text-center">
            <span className="material-symbols-outlined text-[48px] text-secondary mb-3">hourglass_top</span>
            <h2 className="font-headline-lg font-bold text-primary mb-2">Payment Verification in Progress</h2>
            <p className="font-body-md text-on-surface-variant max-w-md mx-auto">
              Your transaction reference is under review by an administrator. Verification occurs against our GCash merchant statement.
            </p>
          </div>

          <div className="w-full bg-surface border border-outline-variant rounded-xl p-5 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Submitted Reference:</span>
              <span className="font-mono font-semibold">
                {(claimState?.claims && claimState.claims.length > 0 && claimState.claims[claimState.claims.length - 1]?.reference) ||
                  booking?.payment?.transaction_reference ||
                  "Recorded"}
              </span>
            </div>
            {claimState?.review_deadline && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Review Deadline:</span>
                <span className="font-semibold text-primary">
                  {new Date(claimState.review_deadline).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full border-2 border-outline-variant text-primary font-label-lg font-bold py-3.5 rounded-xl hover:bg-surface-container-low transition-all"
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* STATE: RECONCILIATION */}
      {currentState === "reconciliation" && (
        <div className="flex flex-col items-center py-4 text-left space-y-4">
          <div className="w-full bg-surface-container-high p-6 rounded-xl border border-outline-variant text-center">
            <span className="material-symbols-outlined text-[48px] text-tertiary mb-3">account_balance</span>
            <h2 className="font-headline-lg font-bold text-primary mb-2">Transfer Under Support Reconciliation</h2>
            <p className="font-body-md text-on-surface-variant max-w-md mx-auto">
              Your payment reference was received and forwarded to our finance desk for reconciliation. Your slot has not been confirmed yet.
            </p>
          </div>

          <p className="text-xs text-on-surface-variant text-center">
            You do not need to submit another reference. Our support team will either allocate your funds or issue a refund if the hold expired.
          </p>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full border-2 border-outline-variant text-primary font-label-lg font-bold py-3.5 rounded-xl hover:bg-surface-container-low transition-all"
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* STATE: REFUND PENDING / REFUNDED */}
      {(currentState === "refund_pending" || currentState === "refunded") && (
        <div className="flex flex-col items-center py-4 text-left space-y-4">
          <div className="w-full bg-surface-container-high p-6 rounded-xl border border-outline-variant text-center">
            <span className="material-symbols-outlined text-[48px] text-secondary mb-3">
              {currentState === "refunded" ? "price_check" : "currency_exchange"}
            </span>
            <h2 className="font-headline-lg font-bold text-primary mb-2">
              {currentState === "refunded" ? "Refund Completed" : "Refund in Progress"}
            </h2>
            <p className="font-body-md text-on-surface-variant max-w-md mx-auto">
              {currentState === "refunded"
                ? "Your refund has been transferred by an administrator to your original payment account."
                : "A refund for this booking is scheduled and awaiting an administrator's transfer."}
            </p>
          </div>

          {claimState?.refund && (
            <div className="w-full bg-surface border border-outline-variant rounded-xl p-5 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Refund Amount:</span>
                <span className="font-bold text-primary">₱{Number(claimState.refund.amount).toFixed(2)}</span>
              </div>
              {claimState.refund.completed_at && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Processed:</span>
                  <span>{new Date(claimState.refund.completed_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full border-2 border-outline-variant text-primary font-label-lg font-bold py-3.5 rounded-xl hover:bg-surface-container-low transition-all"
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* STATE: EXPIRED */}
      {currentState === "expired" && (
        <div className="flex flex-col items-center py-4 text-center space-y-4">
          <div className="w-24 h-24 bg-error-container rounded-full flex items-center justify-center mb-2 shadow-sm">
            <span className="material-symbols-outlined text-[56px] text-error">timer_off</span>
          </div>
          <h2 className="font-display-sm font-bold text-primary">Hold Expired</h2>
          <p className="font-body-lg text-on-surface-variant max-w-md">
            The 15-minute slot reservation for this booking has expired and the slot was released.
            If you already sent funds in GCash, submit your reference below so our team can reconcile or refund your transfer.
          </p>
          {bookingId && !hasSubmittedClaim && (
            <PaymentReferenceForm bookingId={bookingId} onSubmitted={() => void checkStatus()} />
          )}
          <button
            onClick={() => router.push("/counselors")}
            className="w-full max-w-sm bg-primary text-on-primary font-label-lg font-bold py-3.5 rounded-xl hover:opacity-90 transition-all"
          >
            Browse Other Available Slots
          </button>
        </div>
      )}

      {/* STATE: REJECTED */}
      {currentState === "rejected" && (
        <div className="flex flex-col items-center py-4 text-center space-y-4">
          <div className="w-24 h-24 bg-error-container rounded-full flex items-center justify-center mb-2 shadow-sm">
            <span className="material-symbols-outlined text-[56px] text-error">cancel</span>
          </div>
          <h2 className="font-display-sm font-bold text-primary">Reference Not Verified</h2>
          <p className="font-body-lg text-on-surface-variant max-w-md">
            The submitted reference could not be matched with our GCash statement.
            {claimState && claimState.claims.length < 5
              ? " If you entered an incorrect reference number, you may submit a correction below."
              : " The maximum submission limit (5) has been reached. Please contact support."}
          </p>
          {bookingId && claimState && claimState.claims.length < 5 && (
            <PaymentReferenceForm bookingId={bookingId} onSubmitted={() => void checkStatus()} />
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full max-w-sm border-2 border-outline-variant text-primary font-label-lg font-bold py-3.5 rounded-xl hover:bg-surface-container-low transition-all"
          >
            Return to Dashboard
          </button>
        </div>
      )}

      {/* STATE: AWAITING SUBMISSION */}
      {currentState === "awaiting_submission" && (
        <div className="flex flex-col items-center py-2 text-left space-y-6">
          <div className="w-full bg-secondary-container p-6 rounded-xl border border-[#CDEAE1] text-center">
            <span className="material-symbols-outlined text-[48px] text-secondary mb-3">payments</span>
            <h2 className="font-headline-lg font-bold text-primary mb-2">Complete Your Payment</h2>
            <p className="font-body-md text-on-surface-variant">
              Transfer exactly <strong>₱{totalAmount}</strong> via GCash Express Send, then enter your transaction reference below.
            </p>
          </div>

          <div className="w-full bg-surface border border-outline-variant rounded-xl p-6 space-y-4 text-left">
            <h3 className="font-label-lg font-bold text-primary border-b border-surface-container pb-3">GCash Transfer Instructions</h3>
            <ol className="list-decimal pl-5 space-y-3 font-body-md text-on-surface-variant text-sm">
              <li>Open your GCash app and tap <strong>Send Money</strong> &gt; <strong>Express Send</strong>.</li>
              <li>
                Send exactly <strong className="text-primary font-bold">₱{totalAmount}</strong> to GCash Number:{" "}
                <strong className="text-primary font-bold tracking-wide">{gcashNumber}</strong> ({gcashName}).
              </li>
              <li>
                In the message/notes field, write your Booking ID:{" "}
                <span className="bg-surface-container px-2 py-0.5 rounded font-mono text-xs text-primary font-bold">{bookingId}</span>
              </li>
              <li>Complete the transfer, save the receipt, and paste the transaction reference below.</li>
            </ol>
            {claimState?.submission_deadline && (
              <p className="text-xs text-error font-medium">
                Hold expires at: {new Date(claimState.submission_deadline).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)
              </p>
            )}
          </div>

          {bookingId && !hasSubmittedClaim && (
            <PaymentReferenceForm bookingId={bookingId} onSubmitted={() => void checkStatus()} />
          )}

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full border-2 border-outline-variant text-primary font-label-lg font-bold py-3.5 rounded-xl hover:bg-surface-container-low transition-all"
          >
            I've Sent the Payment &mdash; Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <Suspense
        fallback={
          <div className="text-center py-12">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
          </div>
        }
      >
        <SuccessContent />
      </Suspense>
    </DashboardLayout>
  );
}
