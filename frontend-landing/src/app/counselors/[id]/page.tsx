"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getManilaHour } from "@/components/dashboard/WeeklySlotGrid";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/routes";
import type { CounselorProfile } from "@/types";

function formatHourLabel(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${suffix}`;
}

export default function CounselorProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const counselorId = params.id;

  const [counselor, setCounselor] = useState<CounselorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    let active = true;
    const loadCounselor = async () => {
      try {
        const data = await api.get<CounselorProfile>(
          `/counselors/${counselorId}`
        );
        if (active) setCounselor(data);
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCounselor();
    return () => {
      active = false;
    };
  }, [counselorId]);

  // Only fetch live availability slots when user is logged in
  useEffect(() => {
    if (!user || !counselorId || authLoading) return;
    let active = true;
    const loadSlots = async () => {
      setLoadingSlots(true);
      try {
        const res = await api.get<
          Record<string, { available?: string[]; occupied?: string[] }>
        >(
          `/availability/${counselorId}/slots?start_date=${selectedDate}&end_date=${selectedDate}&duration=60`
        );
        if (active) setSlots(res?.[selectedDate]?.available || []);
      } catch {
        if (active) setSlots([]);
      } finally {
        if (active) setLoadingSlots(false);
      }
    };
    loadSlots();
    return () => {
      active = false;
    };
  }, [user, authLoading, counselorId, selectedDate]);

  const upcomingDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return { iso, label };
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="h-80 animate-pulse rounded-3xl border border-border-subtle bg-surface-elevated" />
      </div>
    );
  }

  if (notFound || !counselor) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-5xl text-text-muted"
        >
          person_off
        </span>
        <h1 className="mt-4 font-serif text-3xl font-medium text-text-primary">
          Counselor profile not found
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          This practitioner profile may have been moved or is no longer active.
        </p>
        <Link
          href="/counselors"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Back to Directory
        </Link>
      </div>
    );
  }

  const fullName = counselor.user?.full_name || "Licensed Counselor";

  return (
    <div className="bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/counselors"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
        >
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[18px]"
          >
            arrow_back
          </span>
          <span>Back to Counselors</span>
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Profile Details */}
          <div className="space-y-6 lg:col-span-7">
            <div className="rounded-3xl border border-border-subtle bg-surface-elevated p-6 sm:p-8 shadow-ambient">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {counselor.photo_url ? (
                  <img
                    src={counselor.photo_url}
                    alt={fullName}
                    className="h-20 w-20 rounded-full object-cover border border-border-subtle"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary-light font-serif text-2xl font-semibold text-primary">
                    {getInitials(fullName)}
                  </div>
                )}

                <div>
                  <h1 className="font-serif text-3xl font-medium text-text-primary">
                    {fullName}
                  </h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-3 py-1 text-primary">
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[14px]"
                      >
                        verified
                      </span>
                      PRC-Verified Practitioner
                    </span>
                  </div>
                </div>
              </div>

              {counselor.specialization_tags &&
                counselor.specialization_tags.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Areas of Focus
                    </h2>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {counselor.specialization_tags.map((spec) => (
                        <span
                          key={spec}
                          className="rounded-full border border-border-subtle bg-background px-3 py-1 text-xs font-medium text-text-primary"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              <div className="mt-6 border-t border-border-subtle pt-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Clinical Background &amp; Approach
                </h2>
                <p className="mt-2.5 whitespace-pre-line text-body-md text-text-secondary">
                  {counselor.bio ||
                    "Dedicated to providing a safe, culturally sensitive, and evidence-based space for personal growth and healing."}
                </p>
              </div>
            </div>
          </div>

          {/* Book a Session Panel */}
          <div className="lg:col-span-5">
            <div className="sticky top-24 rounded-3xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
              <h2 className="font-serif text-xl font-medium text-text-primary">
                Book a Session
              </h2>
              <p className="mt-1 text-xs text-text-secondary">
                All session times are shown in Philippine Time (UTC+8).
              </p>

              {authLoading ? (
                <div className="mt-5 h-44 animate-pulse rounded-2xl bg-surface-muted" />
              ) : !user ? (
                <div className="mt-5 rounded-2xl border border-border-subtle bg-background p-5 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-light text-primary">
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[22px]"
                    >
                      lock
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-text-primary">
                    Sign in to view live availability
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                    To protect practitioner schedules and keep bookings
                    private, live time slots are available to signed-in clients.
                  </p>
                  <div className="mt-5 flex flex-col gap-2.5">
                    <Link
                      href={`/login?redirect=${encodeURIComponent(
                        `/counselors/${counselor.id}`
                      )}`}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Sign In to Book
                    </Link>
                    <Link
                      href={`/signup?redirect=${encodeURIComponent(
                        `/counselors/${counselor.id}`
                      )}`}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Create Free Account
                    </Link>
                  </div>
                </div>
              ) : user.role !== "client" ? (
                <div className="mt-5 rounded-2xl border border-border-subtle bg-background p-5 text-sm text-text-secondary">
                  You are signed in with a{" "}
                  <strong className="capitalize text-text-primary">
                    {user.role}
                  </strong>{" "}
                  account. Client accounts are required to book sessions.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="profile-date-select"
                      className="block text-xs font-semibold uppercase tracking-wider text-text-muted"
                    >
                      Select Date
                    </label>
                    <select
                      id="profile-date-select"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-3.5 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {upcomingDays.map((day) => (
                        <option key={day.iso} value={day.iso}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Open Start Times
                    </p>
                    {loadingSlots ? (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {[1, 2, 3].map((n) => (
                          <div
                            key={n}
                            className="h-9 animate-pulse rounded-lg bg-surface-muted"
                          />
                        ))}
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="mt-2 rounded-xl border border-border-subtle bg-background p-3.5 text-xs text-text-secondary">
                        No open slots on this date. Try another day or open the
                        full weekly calendar below.
                      </p>
                    ) : (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {slots.map((iso) => {
                          const hr = getManilaHour(iso);
                          return (
                            <button
                              key={iso}
                              type="button"
                              onClick={() =>
                                router.push(
                                  `/counselors?counselor=${counselor.id}&date=${selectedDate}`
                                )
                              }
                              className="rounded-xl border border-primary/30 bg-primary-light/60 px-2.5 py-2 text-xs font-semibold text-primary tabular-nums transition-colors hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {formatHourLabel(hr)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/counselors?counselor=${counselor.id}&date=${selectedDate}`
                      )
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span>Open Weekly Booking Calendar</span>
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-[18px]"
                    >
                      calendar_month
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
