"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Booking } from "@/types";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("booking_id");

  const [booking, setBooking] = useState<Booking | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    let active = true;
    let count = 0;

    const poll = async () => {
      try {
        const data = await api.get<Booking>(`/bookings/${bookingId}`);
        if (!active) return;
        setBooking(data);
        if (data.status === "confirmed") {
          return;
        }
      } catch {
        // Keep polling up to max attempts
      }

      count += 1;
      if (active) setAttempts(count);
      if (count >= 15) {
        if (active) setTimedOut(true);
        return;
      }

      setTimeout(() => {
        if (active) poll();
      }, 2000);
    };

    poll();
    return () => {
      active = false;
    };
  }, [bookingId]);

  const isConfirmed = booking?.status === "confirmed";

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-ambient">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
          isConfirmed
            ? "bg-status-success-bg text-status-success"
            : "bg-primary-light text-primary"
        }`}
      >
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-[28px]"
        >
          {isConfirmed ? "check_circle" : "hourglass_top"}
        </span>
      </div>

      <h1 className="mt-4 font-serif text-2xl font-medium text-text-primary">
        {isConfirmed
          ? "Payment Confirmed!"
          : timedOut
            ? "Payment Received — Verification Pending"
            : "Confirming Your Payment…"}
      </h1>

      <p className="mt-2 text-sm text-text-secondary">
        {isConfirmed
          ? "Your counseling session is officially confirmed and ready."
          : timedOut
            ? "Your payment is being processed. You can check the latest status on your booking details page."
            : `Checking confirmation status (attempt ${attempts + 1} of 15)…`}
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {bookingId && (
          <Link
            href={`/dashboard/bookings/${bookingId}`}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            View Booking Details
          </Link>
        )}
        <Link
          href="/dashboard"
          className="rounded-xl border border-border-subtle bg-background px-5 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-4 py-12">
      <Suspense
        fallback={
          <div className="h-64 w-full max-w-lg animate-pulse rounded-3xl bg-surface-elevated" />
        }
      >
        <PaymentSuccessContent />
      </Suspense>
    </div>
  );
}
