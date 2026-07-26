"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get("booking_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    async function verifyPayment() {
      if (!bookingId) {
        setStatus("error");
        return;
      }

      try {
        // Since we are bypassing webhooks for local development, we call simulate-success
        // In production, the webhook would have handled this, but calling it again is idempotent.
        const res = await fetch(`http://localhost:8000/payments/simulate-success/${bookingId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (res.ok) {
          setStatus("success");
        } else {
          // It might already be paid
          const errorData = await res.json();
          if (errorData.detail === "Already paid") {
            setStatus("success");
          } else {
            setStatus("error");
          }
        }
      } catch (err) {
        console.error("Verification error:", err);
        setStatus("error");
      }
    }

    verifyPayment();
  }, [bookingId]);

  return (
    <div className="max-w-xl mx-auto mt-16 bg-surface rounded-2xl shadow-ambient p-10 text-center">
      {status === "loading" && (
        <div className="flex flex-col items-center py-12">
          <div className="w-20 h-20 bg-secondary-container rounded-full flex items-center justify-center mb-8 relative">
            <span className="material-symbols-outlined text-[40px] text-secondary absolute animate-pulse">lock</span>
            <div className="absolute inset-0 border-4 border-secondary rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h2 className="font-headline-lg text-primary mb-3">Verifying Payment...</h2>
          <p className="font-body-lg text-on-surface-variant max-w-sm">Please wait securely while we confirm your session details.</p>
        </div>
      )}
      
      {status === "success" && (
        <div className="flex flex-col items-center py-8">
          <div className="w-24 h-24 bg-[#E8F8F0] rounded-full flex items-center justify-center mb-8 shadow-sm">
            <span className="material-symbols-outlined text-[56px] text-[#138A72]">check_circle</span>
          </div>
          <h2 className="font-display-sm font-bold text-primary mb-4">Payment Successful!</h2>
          <p className="font-body-lg text-on-surface-variant mb-10 max-w-md">
            Your session has been successfully booked. You will receive an email confirmation with your Google Meet link shortly.
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
          <h2 className="font-display-sm font-bold text-primary mb-4">Verification Failed</h2>
          <p className="font-body-lg text-on-surface-variant mb-10 max-w-md">
            We couldn&apos;t verify your payment. If you were charged, please contact our support team immediately.
          </p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="w-full max-w-sm border-2 border-outline-variant text-primary font-label-lg font-bold py-4 rounded-xl hover:bg-surface-container-low active:scale-[0.98] transition-all duration-200"
          >
            Return to Dashboard
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
