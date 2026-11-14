"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { DetailPageSkeleton } from "@/components/ui/LoadingState";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
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

export default function AdminBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params.id;
  const { toast } = useToast();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadBooking = async () => {
      try {
        const data = await api.get<Booking>(`/bookings/${bookingId}`);
        if (active) setBooking(data);
      } catch {
        if (active) toast.error("Unable to load booking details.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadBooking();
    return () => {
      active = false;
    };
  }, [bookingId, toast]);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DashboardLayout role="admin">
        <div className="space-y-6">
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-primary"
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
            <DetailPageSkeleton label="Loading booking record…" />
          ) : !booking ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center">
              <p className="text-sm text-text-secondary">Booking not found.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 sm:p-8 shadow-ambient space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Booking #{booking.id.slice(0, 8)}
                  </p>
                  <h1 className="mt-1 font-serif text-2xl font-medium text-text-primary">
                    {booking.client_name ||
                      booking.client?.full_name ||
                      "Client"}{" "}
                    &rarr;{" "}
                    {booking.counselor_name ||
                      booking.counselor?.user?.full_name ||
                      "Counselor"}
                  </h1>
                </div>
                <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold capitalize text-text-primary">
                  {booking.status.replace("_", " ")}
                </span>
              </div>

              <dl className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-5 sm:grid-cols-2 lg:grid-cols-4">
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
                  <dt className="text-xs text-text-muted">Total Amount</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-text-primary tabular-nums">
                    {booking.payment?.amount != null
                      ? `₱${Number(booking.payment.amount).toLocaleString()}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Payment Proof</dt>
                  <dd className="mt-0.5 text-sm">
                    {booking.payment?.proof_url ? (
                      <a
                        href={booking.payment.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary hover:underline"
                      >
                        View Receipt
                      </a>
                    ) : (
                      <span className="text-text-muted">None</span>
                    )}
                  </dd>
                </div>
              </dl>

              {booking.intake_form && (
                <div className="border-t border-border-subtle pt-5 space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Intake Notes
                  </h2>
                  <p className="text-sm text-text-primary">
                    {booking.intake_form.concern_category}
                  </p>
                  {booking.intake_form.notes && (
                    <p className="text-xs text-text-secondary">
                      {booking.intake_form.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
