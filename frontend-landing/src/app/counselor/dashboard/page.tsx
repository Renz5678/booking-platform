"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import { isBookingPast } from "@/lib/bookingTime";
import { getTimeBasedGreeting } from "@/lib/routes";
import type { Booking, CounselorProfile } from "@/types";

function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CounselorDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [profile, setProfile] = useState<CounselorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadBookings = async () => {
      try {
        const [data, myProfile] = await Promise.all([
          api.get<Booking[]>("/bookings/counselor/me"),
          api
            .get<CounselorProfile>("/counselors/me/profile")
            .catch(() => null),
        ]);
        if (active && Array.isArray(data)) {
          setBookings(data);
        }
        if (active && myProfile) {
          setProfile(myProfile);
        }
      } catch {
        if (active) toast.error("Unable to load your counselor schedule.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadBookings();
    return () => {
      active = false;
    };
  }, [toast]);

  const { pendingVerification, upcomingConfirmed, completedCount } =
    useMemo(() => {
      const pending = bookings.filter((b) => b.status === "pending_payment");
      const confirmed = bookings
        .filter((b) => b.status === "confirmed")
        .sort(
          (a, b) =>
            new Date(a.scheduled_start).getTime() -
            new Date(b.scheduled_start).getTime()
        );
      const completed = bookings.filter((b) => b.status === "completed").length;
      return {
        pendingVerification: pending,
        upcomingConfirmed: confirmed,
        completedCount: completed,
      };
    }, [bookings]);

  const displayName = user?.full_name || "Counselor";

  return (
    <ProtectedRoute allowedRoles={["counselor"]}>
      <DashboardLayout role="counselor">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Practitioner Workspace
              </p>
              <h1 className="mt-1 font-serif text-headline-lg text-text-primary">
                {getTimeBasedGreeting()}, {displayName}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Review incoming payment proofs, upcoming sessions, and your
                weekly availability.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/counselor/availability"
                className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Manage Availability
              </Link>
              <Link
                href="/counselor/profile"
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Edit Profile
              </Link>
            </div>
          </div>

          {/* Pending or Deactivated Account Notice */}
          {profile && (!profile.is_active || !profile.is_verified) && (
            <div className="rounded-2xl border border-status-warning/30 bg-status-warning-bg p-4 text-sm text-status-warning">
              {!profile.is_verified
                ? "Your counselor profile is currently pending admin verification. Make sure your PRC credentials and bio are complete in "
                : "Your counselor profile is currently deactivated and hidden from the public directory. Contact an admin or update "}
              <Link href="/counselor/profile" className="font-semibold underline">
                Profile Setup
              </Link>
              .
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Needs Payment Verification
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-status-warning tabular-nums">
                {loading ? "—" : pendingVerification.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Confirmed Upcoming
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-primary tabular-nums">
                {loading ? "—" : upcomingConfirmed.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Completed Sessions
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-text-primary tabular-nums">
                {loading ? "—" : completedCount}
              </p>
            </div>
          </div>

          {/* Needs Verification List */}
          {pendingVerification.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl font-medium text-text-primary">
                  Pending Payment Verification ({pendingVerification.length})
                </h2>
                <Link
                  href="/counselor/bookings"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  View all bookings
                </Link>
              </div>
              <div className="space-y-3">
                {pendingVerification.map((b) => {
                  const clientName =
                    b.client_name || b.client?.full_name || "Client";
                  return (
                    <div
                      key={b.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-status-warning/30 bg-surface-elevated p-5 shadow-ambient sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {clientName}
                        </p>
                        <p className="mt-0.5 text-xs text-text-secondary tabular-nums">
                          {formatManilaDateTime(b.scheduled_start)} PHT
                          {b.payment?.amount != null &&
                            ` • ₱${Number(b.payment.amount).toLocaleString()}`}
                        </p>
                        <p className="mt-1 text-xs font-medium text-text-muted">
                          {isBookingPast(b.scheduled_end)
                            ? "Session time has passed"
                            : b.payment?.proof_url
                              ? "Payment proof uploaded — ready for review"
                              : "Waiting for client to upload payment proof"}
                        </p>
                      </div>
                      <Link
                        href={`/counselor/bookings/${b.id}`}
                        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover"
                      >
                        Review Booking
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Upcoming Confirmed Sessions */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-medium text-text-primary">
                Upcoming Confirmed Sessions
              </h2>
              <Link
                href="/counselor/bookings"
                className="text-xs font-semibold text-primary hover:underline"
              >
                All bookings
              </Link>
            </div>

            {loading ? (
              <div className="h-32 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated" />
            ) : upcomingConfirmed.length === 0 ? (
              <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-8 text-center shadow-ambient">
                <p className="text-sm text-text-secondary">
                  No confirmed upcoming sessions right now.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingConfirmed.slice(0, 5).map((b) => {
                  const clientName =
                    b.client_name || b.client?.full_name || "Client";
                  return (
                    <div
                      key={b.id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {clientName}
                        </p>
                        <p className="mt-0.5 text-xs text-text-secondary tabular-nums">
                          {formatManilaDateTime(b.scheduled_start)} PHT
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {isBookingPast(b.scheduled_end) ? (
                          <Link
                            href={`/counselor/bookings/${b.id}`}
                            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover"
                          >
                            Mark Outcome
                          </Link>
                        ) : (
                          b.meeting_link && (
                            <a
                              href={b.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover"
                            >
                              Join Meet
                            </a>
                          )
                        )}
                        <Link
                          href={`/counselor/bookings/${b.id}`}
                          className="rounded-xl border border-border-subtle bg-background px-4 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted"
                        >
                          Details
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
