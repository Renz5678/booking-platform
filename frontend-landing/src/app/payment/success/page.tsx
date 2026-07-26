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
    <div className="max-w-md mx-auto mt-12 bg-surface-container-lowest rounded-xl shadow-ambient p-8 text-center border border-white">
      {status === "loading" && (
        <div className="flex flex-col items-center">
          <span className="material-symbols-outlined text-[48px] animate-spin text-secondary mb-4">progress_activity</span>
          <h2 className="font-headline-md text-primary mb-2">Verifying Payment...</h2>
          <p className="font-body-md text-on-surface-variant">Please wait while we confirm your session.</p>
        </div>
      )}
      
      {status === "success" && (
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-[#C3F2DA] rounded-full flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-[32px] text-[#138A72]">check_circle</span>
          </div>
          <h2 className="font-headline-lg text-primary mb-2">Payment Successful!</h2>
          <p className="font-body-md text-on-surface-variant mb-8">
            Your session has been confirmed and a Google Meet link has been generated. You will receive a confirmation email shortly.
          </p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="w-full bg-secondary text-on-secondary font-label-md py-3.5 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-sm"
          >
            Go to My Dashboard
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-error-container rounded-full flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-[32px] text-error">error</span>
          </div>
          <h2 className="font-headline-md text-primary mb-2">Verification Failed</h2>
          <p className="font-body-md text-on-surface-variant mb-8">
            We couldn't verify your payment. If you were charged, please contact support.
          </p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="w-full border border-outline text-primary font-label-md py-3.5 rounded-lg hover:bg-surface-container-low active:scale-[0.98] transition-all duration-200"
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
