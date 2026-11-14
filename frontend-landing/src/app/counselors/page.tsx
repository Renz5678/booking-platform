"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import WeeklySlotGrid, {
  buildManilaSlotIso,
  formatLocalDate,
  getManilaHour,
  type WeeklySlotMap,
} from "@/components/dashboard/WeeklySlotGrid";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import { fallbackCounselors } from "@/data/site";
import { getCaptchaToken } from "@/lib/captcha";
import { getInitials } from "@/lib/routes";
import type { CounselorProfile } from "@/types";

function getMonday(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  return copy;
}

function formatHourLabel(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${suffix}`;
}

function CounselorsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const initialSearch = searchParams.get("q") || "";
  const initialSpec = searchParams.get("spec") || "All";
  const deepLinkedCounselorId = searchParams.get("counselor");
  const deepLinkedDate = searchParams.get("date");

  const [counselors, setCounselors] = useState<CounselorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedSpec, setSelectedSpec] = useState(initialSpec);

  // Booking modal state
  const [bookingCounselor, setBookingCounselor] =
    useState<CounselorProfile | null>(null);
  const [bookingStep, setBookingStep] = useState<1 | 2>(1);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getMonday(new Date())
  );
  const [weeklySlots, setWeeklySlots] = useState<WeeklySlotMap>({});
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedStartHour, setSelectedStartHour] = useState<number | null>(
    null
  );
  const [selectedEndHour, setSelectedEndHour] = useState<number | null>(null);

  // Intake form state
  const [reason, setReason] = useState("");
  const [modality, setModality] = useState("Video Call (Google Meet)");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const loadCounselors = async () => {
      try {
        const data = await api.get<CounselorProfile[]>("/counselors/");
        if (active && Array.isArray(data)) {
          setCounselors(data);
        }
      } catch {
        if (active) {
          setCounselors(
            fallbackCounselors.map((c) => ({
              id: c.id,
              bio: c.bio,
              photo_url: c.photo_url || null,
              specialization_tags: c.specializations,
              google_calendar_connected: false,
              is_verified: true,
              is_active: true,
              credentials_url: null,
              user: {
                id: c.id,
                email: "care@alaga.ph",
                full_name: c.name,
                role: "counselor",
                is_active: true,
                is_verified: true,
              },
            }))
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCounselors();
    return () => {
      active = false;
    };
  }, [toast]);

  const specializations = useMemo(() => {
    const set = new Set<string>();
    counselors.forEach((c) => {
      c.specialization_tags?.forEach((s) => set.add(s));
    });
    return ["All", ...Array.from(set).sort()];
  }, [counselors]);

  const updateUrlFilters = useCallback(
    (q: string, spec: string) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (spec && spec !== "All") params.set("spec", spec);
      const qs = params.toString();
      router.replace(qs ? `/counselors?${qs}` : "/counselors", {
        scroll: false,
      });
    },
    [router]
  );

  const filteredCounselors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return counselors.filter((c) => {
      const matchesSpec =
        selectedSpec === "All" ||
        c.specialization_tags?.includes(selectedSpec);
      if (!matchesSpec) return false;
      if (!q) return true;
      const name = c.user?.full_name?.toLowerCase() || "";
      const bio = c.bio?.toLowerCase() || "";
      const specs = (c.specialization_tags || []).join(" ").toLowerCase();
      return name.includes(q) || bio.includes(q) || specs.includes(q);
    });
  }, [counselors, searchQuery, selectedSpec]);

  const fetchWeekSlots = useCallback(
    async (counselorId: string, weekStart: Date) => {
      setLoadingSlots(true);
      try {
        const end = new Date(weekStart);
        end.setDate(end.getDate() + 6);
        const startStr = formatLocalDate(weekStart);
        const endStr = formatLocalDate(end);

        const data = await api.get<
          Record<string, { available?: string[]; occupied?: string[] }>
        >(
          `/availability/${counselorId}/slots?start_date=${startStr}&end_date=${endStr}&duration=60`
        );

        const map: WeeklySlotMap = {};
        Object.entries(data || {}).forEach(([dateStr, dayData]) => {
          const hours = new Set<number>();
          (dayData?.available || []).forEach((iso) => {
            hours.add(getManilaHour(iso));
          });
          map[dateStr] = hours;
        });
        setWeeklySlots(map);
      } catch {
        setWeeklySlots({});
      } finally {
        setLoadingSlots(false);
      }
    },
    []
  );

  const openBookingModal = useCallback(
    (counselor: CounselorProfile, targetDateStr?: string | null) => {
      if (!user) {
        toast.info(
          "Please sign in to view live availability and book a session."
        );
        router.push(
          `/login?redirect=${encodeURIComponent(
            `/counselors?counselor=${counselor.id}`
          )}`
        );
        return;
      }

      if (user.role !== "client") {
        toast.info("Only client accounts can book counseling sessions.");
        return;
      }

      const baseDate = targetDateStr
        ? new Date(`${targetDateStr}T00:00:00`)
        : new Date();
      const monday = getMonday(
        isNaN(baseDate.getTime()) ? new Date() : baseDate
      );

      setBookingCounselor(counselor);
      setBookingStep(1);
      setCurrentWeekStart(monday);
      setSelectedDate("");
      setSelectedStartHour(null);
      setSelectedEndHour(null);
      setReason("");
      setAdditionalNotes("");
      setPrivacyAgreed(false);
      fetchWeekSlots(counselor.id, monday);
    },
    [user, toast, router, fetchWeekSlots]
  );

  // Handle deep-link ?counselor=<id> once auth & counselors resolve
  useEffect(() => {
    if (
      !deepLinkedCounselorId ||
      loading ||
      authLoading ||
      bookingCounselor ||
      counselors.length === 0
    ) {
      return;
    }
    const found = counselors.find((c) => c.id === deepLinkedCounselorId);
    if (found && user?.role === "client") {
      openBookingModal(found, deepLinkedDate);
    }
  }, [
    deepLinkedCounselorId,
    deepLinkedDate,
    loading,
    authLoading,
    bookingCounselor,
    counselors,
    user,
    openBookingModal,
  ]);

  // Escape key closes modal
  useEffect(() => {
    if (!bookingCounselor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        setBookingCounselor(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bookingCounselor, submitting]);

  const handleWeekChange = (newMonday: Date) => {
    setCurrentWeekStart(newMonday);
    setSelectedDate("");
    setSelectedStartHour(null);
    setSelectedEndHour(null);
    if (bookingCounselor) {
      fetchWeekSlots(bookingCounselor.id, newMonday);
    }
  };

  const handleSelectRange = (dateStr: string, minHour: number, maxHour: number) => {
    setSelectedDate(dateStr);
    setSelectedStartHour(minHour);
    setSelectedEndHour(maxHour + 1);
  };

  const durationHours =
    selectedStartHour !== null && selectedEndHour !== null
      ? selectedEndHour - selectedStartHour
      : 0;
  const estimatedTotal = durationHours > 0 ? 1500 * durationHours : 0;

  const handleBookingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !bookingCounselor ||
      !selectedDate ||
      selectedStartHour === null ||
      selectedEndHour === null
    ) {
      toast.error("Please select an available time slot first.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please share a brief reason for your counseling session.");
      return;
    }
    if (!privacyAgreed) {
      toast.error("Please acknowledge the confidentiality notice to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const startIso = buildManilaSlotIso(selectedDate, selectedStartHour);
      const endIso = buildManilaSlotIso(selectedDate, selectedEndHour);

      const notesCombined = [
        modality ? `Preferred format: ${modality}` : "",
        emergencyContactName.trim()
          ? `Emergency contact: ${emergencyContactName.trim()} ${
              emergencyContactPhone.trim()
                ? `(${emergencyContactPhone.trim()})`
                : ""
            }`
          : "",
        additionalNotes.trim(),
      ]
        .filter(Boolean)
        .join("\n");

      const captchaToken = await getCaptchaToken("booking");
      const res = await api.post<{ id?: string; booking_id?: string }>(
        "/bookings/",
        {
          counselor_id: bookingCounselor.id,
          scheduled_start: startIso,
          scheduled_end: endIso,
          intake_concern_category: reason.trim(),
          intake_notes: notesCombined || undefined,
          captcha_token: captchaToken,
          honeypot: "",
        }
      );

      toast.success("Booking created! Complete your payment proof to confirm.");
      setBookingCounselor(null);
      router.push(`/dashboard/bookings/${res.booking_id || res.id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to create booking. The slot may no longer be available.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl">
          <span className="text-label-md uppercase tracking-wider text-primary">
            Verified Directory
          </span>
          <h1 className="mt-2 font-serif text-headline-xl text-text-primary">
            Find the right counselor for you
          </h1>
          <p className="mt-3 text-body-md text-text-secondary">
            Browse PRC-licensed mental health professionals.{" "}
            {!user && (
              <span>
                <Link
                  href="/login?redirect=/counselors"
                  className="font-semibold text-primary hover:underline"
                >
                  Sign in
                </Link>{" "}
                when you&apos;re ready to view live time slots and book a
                session.
              </span>
            )}
          </p>
        </div>

        {/* Search & Filter Controls */}
        <div className="mt-8 space-y-4">
          <div className="relative max-w-md">
            <label htmlFor="counselor-search" className="sr-only">
              Search counselors by name, bio, or specialization
            </label>
            <span
              aria-hidden="true"
              className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-text-muted"
            >
              search
            </span>
            <input
              id="counselor-search"
              type="search"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                updateUrlFilters(val, selectedSpec);
              }}
              placeholder="Search by name or focus area…"
              className="w-full rounded-xl border border-border-subtle bg-surface-elevated py-2.5 pl-11 pr-4 text-sm text-text-primary placeholder:text-text-muted shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div
            role="group"
            aria-label="Filter by specialization"
            className="flex flex-wrap gap-2"
          >
            {specializations.map((spec) => {
              const active = selectedSpec === spec;
              return (
                <button
                  key={spec}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedSpec(spec);
                    updateUrlFilters(searchQuery, spec);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "border border-border-subtle bg-surface-elevated text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  }`}
                >
                  {spec}
                </button>
              );
            })}
          </div>
        </div>

        {/* Counselor Grid */}
        <div className="mt-8">
          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-72 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated"
                />
              ))}
            </div>
          ) : filteredCounselors.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-12 text-center shadow-ambient">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-4xl text-text-muted"
              >
                person_search
              </span>
              <h2 className="mt-3 font-serif text-xl font-medium text-text-primary">
                No matching counselors found
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Try clearing your search or selecting a different focus area.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedSpec("All");
                  updateUrlFilters("", "All");
                }}
                className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredCounselors.map((counselor) => {
                const fullName =
                  counselor.user?.full_name || "Licensed Counselor";
                return (
                  <article
                    key={counselor.id}
                    className="flex flex-col justify-between rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient transition-shadow hover:shadow-ambient-hover"
                  >
                    <div>
                      <div className="flex items-start gap-4">
                        {counselor.photo_url ? (
                          <img
                            src={counselor.photo_url}
                            alt={fullName}
                            className="h-14 w-14 shrink-0 rounded-full object-cover border border-border-subtle"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-light font-serif text-lg font-semibold text-primary">
                            {getInitials(fullName)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-lg font-semibold text-text-primary">
                            {fullName}
                          </h2>
                          <p className="mt-0.5 text-xs font-medium text-primary">
                            PRC-Verified Practitioner
                          </p>
                        </div>
                      </div>

                      {counselor.specialization_tags &&
                        counselor.specialization_tags.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {counselor.specialization_tags
                              .slice(0, 4)
                              .map((spec) => (
                                <span
                                  key={spec}
                                  className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-text-secondary"
                                >
                                  {spec}
                                </span>
                              ))}
                          </div>
                        )}

                      <p className="mt-4 line-clamp-3 text-body-sm text-text-secondary">
                        {counselor.bio ||
                          "Providing compassionate, evidence-based, and confidential mental health care."}
                      </p>
                    </div>

                    <div className="mt-6 border-t border-border-subtle pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-text-muted">
                            Session Format
                          </span>
                          <p className="text-sm font-semibold text-text-primary">
                            Private 1-on-1
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/counselors/${counselor.id}`}
                            className="rounded-xl border border-border-subtle bg-background px-3.5 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            View Profile
                          </Link>
                          <button
                            type="button"
                            onClick={() => openBookingModal(counselor)}
                            className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {user ? "Book Session" : "Sign in to Book"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2-Step Booking Modal */}
      {bookingCounselor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/50 p-4 backdrop-blur-xs animate-fade-in overscroll-contain"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setBookingCounselor(null);
            }
          }}
        >
          <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border-subtle bg-surface-elevated shadow-2xl animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <div>
                <p className="text-xs font-medium text-primary">
                  Step {bookingStep} of 2 &bull;{" "}
                  {bookingStep === 1
                    ? "Select Available Time"
                    : "Intake & Confirmation"}
                </p>
                <h2
                  id="booking-modal-title"
                  className="font-serif text-xl font-medium text-text-primary"
                >
                  Book with {bookingCounselor.user?.full_name || "Counselor"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close booking dialog"
                disabled={submitting}
                onClick={() => setBookingCounselor(null)}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[20px]"
                >
                  close
                </span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6">
              {bookingStep === 1 ? (
                <div className="space-y-5">
                  <WeeklySlotGrid
                    currentWeekStart={currentWeekStart}
                    onWeekChange={handleWeekChange}
                    availableWeeklySlots={weeklySlots}
                    loadingSlots={loadingSlots}
                    onSelectRange={handleSelectRange}
                    isHighlighted={(dateStr, hour) =>
                      dateStr === selectedDate &&
                      selectedStartHour !== null &&
                      selectedEndHour !== null &&
                      hour >= selectedStartHour &&
                      hour < selectedEndHour
                    }
                    highlightLabel="Selected"
                  />

                  {/* Selected Slot Summary Bar */}
                  <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border-subtle bg-background p-4 sm:flex-row sm:items-center">
                    {selectedDate &&
                    selectedStartHour !== null &&
                    selectedEndHour !== null ? (
                      <div>
                        <p className="text-xs font-medium text-text-muted">
                          Selected Session (Philippine Time)
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-text-primary tabular-nums">
                          {selectedDate} &bull;{" "}
                          {formatHourLabel(selectedStartHour)} &ndash;{" "}
                          {formatHourLabel(selectedEndHour)} ({durationHours}{" "}
                          {durationHours === 1 ? "hr" : "hrs"})
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-primary tabular-nums">
                          Estimated Total: &#8369;
                          {estimatedTotal.toLocaleString()}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-text-secondary">
                        Click or drag across green open slots above to choose
                        your session time.
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={
                        !selectedDate ||
                        selectedStartHour === null ||
                        selectedEndHour === null
                      }
                      onClick={() => setBookingStep(2)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span>Continue to Intake Details</span>
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[18px]"
                      >
                        arrow_forward
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleBookingSubmit} className="space-y-5">
                  <div className="rounded-xl border border-border-subtle bg-primary-light/50 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-text-primary tabular-nums">
                          {selectedDate} &bull;{" "}
                          {selectedStartHour !== null &&
                            formatHourLabel(selectedStartHour)}{" "}
                          &ndash;{" "}
                          {selectedEndHour !== null &&
                            formatHourLabel(selectedEndHour)}
                        </span>
                        <p className="text-xs text-text-secondary tabular-nums">
                          Total Fee: &#8369;{estimatedTotal.toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBookingStep(1)}
                        className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                      >
                        Change Time
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="intake-reason"
                      className="block text-sm font-medium text-text-primary"
                    >
                      What brings you to counseling?{" "}
                      <span className="text-status-danger">*</span>
                    </label>
                    <textarea
                      id="intake-reason"
                      required
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Share briefly what you'd like to focus on in this session…"
                      className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="intake-modality"
                        className="block text-sm font-medium text-text-primary"
                      >
                        Preferred Session Format
                      </label>
                      <div className="relative mt-1.5">
                        <select
                          id="intake-modality"
                          value={modality}
                          onChange={(e) => setModality(e.target.value)}
                          className="select-control min-h-[44px] w-full rounded-xl border border-border-subtle bg-background py-2.5 pl-4 pr-10 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <option value="Video Call (Google Meet)">
                            Video Call (Google Meet)
                          </option>
                          <option value="Audio Only Call">Audio Only Call</option>
                        </select>
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[20px] text-text-muted"
                        >
                          expand_more
                        </span>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="intake-notes"
                        className="block text-sm font-medium text-text-primary"
                      >
                        Additional Notes (Optional)
                      </label>
                      <input
                        id="intake-notes"
                        type="text"
                        value={additionalNotes}
                        onChange={(e) => setAdditionalNotes(e.target.value)}
                        placeholder="Language preference, accessibility needs, etc."
                        className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="intake-emergency-name"
                        className="block text-sm font-medium text-text-primary"
                      >
                        Emergency Contact Name (Optional)
                      </label>
                      <input
                        id="intake-emergency-name"
                        type="text"
                        value={emergencyContactName}
                        onChange={(e) =>
                          setEmergencyContactName(e.target.value)
                        }
                        placeholder="Trusted family member or friend"
                        className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="intake-emergency-phone"
                        className="block text-sm font-medium text-text-primary"
                      >
                        Emergency Contact Phone (Optional)
                      </label>
                      <input
                        id="intake-emergency-phone"
                        type="tel"
                        value={emergencyContactPhone}
                        onChange={(e) =>
                          setEmergencyContactPhone(e.target.value)
                        }
                        placeholder="09XX-XXX-XXXX"
                        className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 rounded-xl border border-border-subtle bg-background p-3.5 text-xs text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacyAgreed}
                      onChange={(e) => setPrivacyAgreed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border-strong text-primary focus:ring-primary"
                    />
                    <span>
                      I understand that my intake notes are confidential under
                      RA 10173 and will be shared only with my selected
                      counselor.
                    </span>
                  </label>

                  <div className="flex flex-col-reverse gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setBookingStep(1)}
                      className="rounded-xl border border-border-subtle bg-background px-5 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Back to Time Selection
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {submitting ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                          />
                          <span>Submitting Booking…</span>
                        </>
                      ) : (
                        <span>Confirm Booking Request</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CounselorsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="font-serif text-headline-xl text-primary mb-6">
            Licensed Counselors &amp; Psychologists
          </h1>
          <div className="h-64 animate-pulse rounded-2xl bg-surface-elevated" />
        </div>
      }
    >
      <CounselorsContent />
    </Suspense>
  );
}
