"use client";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { captchaToken } from "@/lib/captcha";

import React, { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface CounselorProfile {
  id: string;
  bio: string | null;
  photo_url?: string | null;
  specialization_tags: string[];
  user: {
    id: string;
    full_name: string;
  };
}

function FindCounselorContent() {
  const bookingAttempt = useRef<{ payload: string; key: string } | null>(null);
  const { executeRecaptcha } = useGoogleReCaptcha();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [counselors, setCounselors] = useState<CounselorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string>("All");

  // Booking Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCounselor, setSelectedCounselor] = useState<CounselorProfile | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Wizard State
  const [bookingStep, setBookingStep] = useState<1 | 2>(1);

  // Booking Form State
  const duration = 60; // Fixed hourly session
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d;
  });
  const [availableWeeklySlots, setAvailableWeeklySlots] = useState<
    Record<string, { available: string[]; occupied: string[] }>
  >({});
  const [dragSelection, setDragSelection] = useState<{
    dateStr: string;
    startHour: number;
    endHour: number;
  } | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<{
    dateStr: string;
    startTime: string;
    endTime: string;
    startHour: number;
    endHour: number;
    slotsCount: number;
  } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [intakeCategory, setIntakeCategory] = useState("General");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    const fetchCounselors = async () => {
      try {
        const data = await api.get("/counselors");
        setCounselors(data || []);
      } catch (err) {
        console.error("Failed to fetch counselors:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCounselors();
  }, []);

  // Handle auto-open if redirected with ?book={counselor_id}
  useEffect(() => {
    const bookId = searchParams.get("book");
    if (bookId && counselors.length > 0) {
      const match = counselors.find((c) => c.id === bookId);
      if (match) {
        openBookingModal(match);
      }
    }
  }, [searchParams, counselors]);

  useEffect(() => {
    if (isModalOpen && selectedCounselor) {
      const fetchSlots = async () => {
        setLoadingSlots(true);
        try {
          const start = new Date(currentWeekStart);
          const end = new Date(currentWeekStart);
          end.setDate(end.getDate() + 6);
          const startDateStr = formatLocalDate(start);
          const endDateStr = formatLocalDate(end);

          const data = await api.get(
            `/availability/${selectedCounselor.id}/slots?start_date=${startDateStr}&end_date=${endDateStr}&duration=${duration}`
          );
          setAvailableWeeklySlots(data || {});
        } catch (err) {
          console.error("Failed to fetch slots:", err);
          setAvailableWeeklySlots({});
        } finally {
          setLoadingSlots(false);
        }
      };
      fetchSlots();
    }
  }, [isModalOpen, selectedCounselor, currentWeekStart, duration]);

  const openBookingModal = (counselor: CounselorProfile) => {
    if (!user) {
      router.push(`/login?redirect=/counselors?book=${counselor.id}`);
      return;
    }

    setSelectedCounselor(counselor);

    // Reset to current week
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    setCurrentWeekStart(d);

    setBookingStep(1);
    setSelectedTimeRange(null);
    setDragSelection(null);
    setConsentChecked(false);
    setBookingError(null);
    setIsModalOpen(true);
  };

  const handleBookSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCounselor || !selectedTimeRange) return;

    if (!consentChecked) {
      alert("Please agree to the Data Privacy Act (RA 10173) consent to proceed.");
      return;
    }

    if (honeypot) return;

    setIsBooking(true);

    const start = new Date(selectedTimeRange.startTime);
    const end = new Date(selectedTimeRange.endTime);

    const payload = {
      counselor_id: selectedCounselor.id,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      intake_concern_category: intakeCategory,
      intake_notes: intakeNotes,
      captcha_token: "",
      honeypot: "",
    };

    try {
      setBookingError(null);
      payload.captcha_token = await captchaToken(executeRecaptcha, "booking");
      const fingerprint = JSON.stringify({ ...payload, captcha_token: "" });
      if (bookingAttempt.current?.payload !== fingerprint) bookingAttempt.current = { payload: fingerprint, key: crypto.randomUUID() };
      const data = await api.post("/bookings/", payload, { headers: { "Idempotency-Key": bookingAttempt.current!.key } });

      if (data.booking_id) {
        window.location.href = `/payment/success?booking_id=${data.booking_id}`;
      } else {
        setBookingError("Booking created, but no booking ID was returned. Please check your dashboard.");
        setIsModalOpen(false);
      }
    } catch (err: unknown) {
      console.error("Booking error:", err);
      if (err instanceof ApiError) {
        setBookingError(err.message || "Failed to book session. Please check slot availability.");
      } else {
        setBookingError("An error occurred while booking. Please try again.");
      }
    } finally {
      setIsBooking(false);
    }
  };

  // Extract all unique specialization tags
  const allTags = [
    "All",
    ...Array.from(new Set(counselors.flatMap((c) => c.specialization_tags || []))).filter(Boolean),
  ];

  const filteredCounselors =
    selectedTag === "All"
      ? counselors
      : counselors.filter((c) => c.specialization_tags?.includes(selectedTag));

  return (
    <div className="min-h-screen bg-[#E1F4F1] py-10 px-4 md:px-12">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="font-headline-xl text-primary mb-2">Find a Counselor</h1>
          <p className="font-body-lg text-on-surface-variant max-w-2xl">
            Browse our licensed, verified therapists and schedule a compassionate, confidential session tailored to your needs.
          </p>
        </div>

        {/* Specialization Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-8 items-center">
          <span className="font-label-sm text-on-surface-variant uppercase tracking-wider mr-2 font-semibold">
            Filter:
          </span>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-4 py-1.5 rounded-full font-label-sm transition-all duration-200 ${
                selectedTag === tag
                  ? "bg-primary text-on-primary font-bold shadow-sm"
                  : "bg-surface text-on-surface-variant border border-outline-variant hover:border-primary"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm animate-pulse space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-surface-variant/30"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-3/4 bg-surface-variant/40 rounded"></div>
                    <div className="h-3 w-1/2 bg-surface-variant/30 rounded"></div>
                  </div>
                </div>
                <div className="h-16 bg-surface-variant/20 rounded"></div>
                <div className="h-10 bg-surface-variant/30 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : filteredCounselors.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl text-center border border-outline-variant/40 shadow-sm max-w-xl mx-auto">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-2">search_off</span>
            <p className="font-headline-sm text-primary mb-2">No Counselors Found</p>
            <p className="font-body-md text-on-surface-variant mb-4">
              {selectedTag !== "All"
                ? `No counselors match the specialization "${selectedTag}". Try selecting another category.`
                : "No counselors are currently accepting bookings. Please check back shortly!"}
            </p>
            {selectedTag !== "All" && (
              <button
                onClick={() => setSelectedTag("All")}
                className="bg-primary text-on-primary px-5 py-2 rounded-full font-label-md"
              >
                Clear Filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCounselors.map((counselor) => (
              <div
                key={counselor.id}
                className="bg-white border border-outline-variant/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-primary-container text-2xl shrink-0 overflow-hidden relative border-2 border-primary/10">
                      {counselor.photo_url ? (
                        <img
                          src={counselor.photo_url}
                          alt={counselor.user.full_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-bold text-primary">
                          {counselor.user.full_name ? counselor.user.full_name[0].toUpperCase() : "C"}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-headline-sm text-primary font-bold line-clamp-1">
                        {counselor.user.full_name}
                      </h3>
                      <p className="font-label-sm text-secondary flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-[16px]">verified</span>
                        Licensed Counselor
                      </p>
                    </div>
                  </div>

                  <p className="font-body-sm text-on-surface-variant line-clamp-3 mb-4 min-h-[60px]">
                    {counselor.bio || "Compassionate mental health professional dedicated to client wellbeing."}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-6 min-h-[30px]">
                    {counselor.specialization_tags && counselor.specialization_tags.length > 0 ? (
                      counselor.specialization_tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="bg-secondary-container/60 text-on-secondary-container px-2.5 py-0.5 rounded-full font-label-sm text-[12px]"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-on-surface-variant italic font-label-sm text-[12px]">
                        General Counseling
                      </span>
                    )}
                    {counselor.specialization_tags && counselor.specialization_tags.length > 3 && (
                      <span className="text-on-surface-variant font-label-sm text-[12px] self-center">
                        +{counselor.specialization_tags.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-outline-variant/30">
                  <Link
                    href={`/counselors/${counselor.id}`}
                    className="flex-1 text-center border border-outline-variant text-primary font-label-md py-2.5 rounded-xl hover:bg-surface transition-colors"
                  >
                    View Profile
                  </Link>
                  <button
                    onClick={() => openBookingModal(counselor)}
                    className="flex-1 bg-secondary text-on-secondary font-label-md py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-sm font-semibold"
                  >
                    Book Session
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Booking Modal */}
        {isModalOpen && selectedCounselor && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div
              className={`bg-white rounded-2xl w-full p-6 shadow-2xl max-h-[95vh] overflow-y-auto ${
                bookingStep === 1 ? "max-w-4xl" : "max-w-lg"
              }`}
            >
              <div className="flex justify-between items-center mb-6 border-b border-surface-container pb-4">
                <div>
                  <h2 className="font-headline-md text-[20px] font-bold text-primary">
                    Book Session with {selectedCounselor.user.full_name}
                  </h2>
                  <p className="font-body-sm text-on-surface-variant">₱300.00 / 60-minute session</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-on-surface-variant hover:text-error transition-colors p-1"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {bookingError && (
                <div role="alert" className="bg-error-container text-on-error-container p-3 rounded-xl text-sm font-medium mb-4">
                  {bookingError}
                </div>
              )}

              {bookingStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-label-lg font-semibold text-primary mb-1">Step 1: Select Time</h3>
                    <p className="font-body-sm text-on-surface-variant">
                      Click an available green time block to schedule a 1-hour session.
                    </p>
                  </div>

                  <div className="flex justify-between items-center bg-surface p-3 rounded-xl border border-outline-variant">
                    <button
                      onClick={() => {
                        const newDate = new Date(currentWeekStart);
                        newDate.setDate(newDate.getDate() - 7);
                        setCurrentWeekStart(newDate);
                      }}
                      className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-label-md"
                    >
                      <span className="material-symbols-outlined text-[20px]">chevron_left</span> Prev
                    </button>
                    <span className="font-label-lg text-primary font-bold">
                      Week of {currentWeekStart.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <button
                      onClick={() => {
                        const newDate = new Date(currentWeekStart);
                        newDate.setDate(newDate.getDate() + 7);
                        setCurrentWeekStart(newDate);
                      }}
                      className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-label-md"
                    >
                      Next <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                    </button>
                  </div>

                  <div className="border border-outline-variant rounded-xl overflow-hidden bg-white relative min-h-[300px]">
                    {loadingSlots && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
                          progress_activity
                        </span>
                      </div>
                    )}

                    {/* Legend */}
                    <div className="flex items-center justify-center gap-6 py-3 border-b border-surface-container bg-surface-container-lowest">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-secondary-container rounded-sm"></div>
                        <span className="font-label-sm text-on-surface-variant text-[12px]">Available</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-primary rounded-sm"></div>
                        <span className="font-label-sm text-on-surface-variant text-[12px]">Selected</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-error rounded-sm"></div>
                        <span className="font-label-sm text-on-surface-variant text-[12px]">Occupied</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-surface-container border border-dashed border-outline-variant/50 rounded-sm"></div>
                        <span className="font-label-sm text-on-surface-variant text-[12px]">Unavailable</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <div className="min-w-[700px] p-4">
                        <div className="grid grid-cols-8 gap-2 mb-2 text-center border-b border-outline-variant pb-2">
                          <div className="font-label-sm text-[12px] font-semibold text-on-surface-variant uppercase flex items-end justify-center">
                            Time
                          </div>
                          {Array.from({ length: 7 }).map((_, i) => {
                            const d = new Date(currentWeekStart);
                            d.setDate(d.getDate() + i);
                            const dayName = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i];
                            const isToday = d.toDateString() === new Date().toDateString();
                            return (
                              <div
                                key={i}
                                className={`flex flex-col items-center ${isToday ? "text-secondary font-bold" : "text-primary"}`}
                              >
                                <span className="font-label-sm uppercase text-[11px] opacity-70">{dayName}</span>
                                <span className="font-label-lg font-bold">{d.getDate()}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div
                          className="grid grid-cols-8 gap-x-2 gap-y-0"
                          onMouseUp={() => {
                            if (dragSelection) {
                              const minHour = Math.min(dragSelection.startHour, dragSelection.endHour);
                              const maxHour = Math.max(dragSelection.startHour, dragSelection.endHour);

                              const slotsForDay = availableWeeklySlots[dragSelection.dateStr]?.available || [];
                              let allAvailable = true;
                              for (let h = minHour; h <= maxHour; h++) {
                                const hasSlot = slotsForDay.some((slotStr) => {
                                  const hour = parseInt(slotStr.substring(11, 13), 10);
                                  return hour === h;
                                });
                                if (!hasSlot) {
                                  allAvailable = false;
                                  break;
                                }
                              }

                              if (allAvailable) {
                                const startIso = `${dragSelection.dateStr}T${minHour.toString().padStart(2, "0")}:00:00+08:00`;
                                const endIso = `${dragSelection.dateStr}T${(maxHour + 1).toString().padStart(2, "0")}:00:00+08:00`;
                                const startD = new Date(startIso);
                                const endD = new Date(endIso);
                                setSelectedTimeRange({
                                  dateStr: dragSelection.dateStr,
                                  startTime: startD.toISOString(),
                                  endTime: endD.toISOString(),
                                  startHour: minHour,
                                  endHour: maxHour,
                                  slotsCount: maxHour - minHour + 1,
                                });
                              }
                              setDragSelection(null);
                            }
                          }}
                          onMouseLeave={() => setDragSelection(null)}
                        >
                          {[
                            "8:00 AM",
                            "9:00 AM",
                            "10:00 AM",
                            "11:00 AM",
                            "12:00 PM",
                            "1:00 PM",
                            "2:00 PM",
                            "3:00 PM",
                            "4:00 PM",
                            "5:00 PM",
                          ].map((time, timeIndex) => (
                            <React.Fragment key={time}>
                              <div className="font-label-sm text-[12px] font-semibold text-on-surface-variant text-right pr-2 py-1 flex items-center justify-end h-10">
                                {time}
                              </div>
                              {Array.from({ length: 7 }).map((_, dayIndex) => {
                                const d = new Date(currentWeekStart);
                                d.setDate(d.getDate() + dayIndex);
                                const dateStr = formatLocalDate(d);

                                const startHour = 8 + timeIndex;
                                const slotIsoStr = `${dateStr}T${startHour.toString().padStart(2, "0")}:00:00+08:00`;

                                const slotsForDay = availableWeeklySlots[dateStr] || {
                                  available: [],
                                  occupied: [],
                                };

                                const isAvailable = slotsForDay.available?.some(
                                  (slotStr) => parseInt(slotStr.substring(11, 13), 10) === startHour
                                );
                                const isOccupied = slotsForDay.occupied?.some(
                                  (slotStr) => parseInt(slotStr.substring(11, 13), 10) === startHour
                                );

                                const isPast = new Date(slotIsoStr) < new Date();

                                const isSelected =
                                  (dragSelection &&
                                    dragSelection.dateStr === dateStr &&
                                    startHour >= Math.min(dragSelection.startHour, dragSelection.endHour) &&
                                    startHour <= Math.max(dragSelection.startHour, dragSelection.endHour)) ||
                                  (!dragSelection &&
                                    selectedTimeRange &&
                                    selectedTimeRange.dateStr === dateStr &&
                                    startHour >= selectedTimeRange.startHour &&
                                    startHour <= selectedTimeRange.endHour);

                                if (isOccupied && !isPast) {
                                  return (
                                    <div
                                      key={`${dayIndex}-${timeIndex}`}
                                      className="h-10 bg-error/90 rounded-sm flex items-center justify-center my-0.5"
                                    ></div>
                                  );
                                } else if (isAvailable && !isPast) {
                                  return (
                                    <div
                                      key={`${dayIndex}-${timeIndex}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setDragSelection({ dateStr, startHour, endHour: startHour });
                                      }}
                                      onMouseEnter={() => {
                                        if (dragSelection && dragSelection.dateStr === dateStr) {
                                          setDragSelection({ ...dragSelection, endHour: startHour });
                                        }
                                      }}
                                      className={`h-10 transition-colors cursor-pointer rounded-sm my-0.5 select-none ${
                                        isSelected
                                          ? "bg-primary text-on-primary"
                                          : "bg-secondary-container hover:bg-[#65de7e]"
                                      }`}
                                    ></div>
                                  );
                                } else {
                                  return (
                                    <div
                                      key={`${dayIndex}-${timeIndex}`}
                                      className="h-10 bg-surface-container border-x border-dashed border-outline-variant/40 rounded-sm my-0.5 opacity-50"
                                    ></div>
                                  );
                                }
                              })}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Selected Slot Summary & Action Bar */}
                  <div className="p-4 bg-surface-container-low border border-outline-variant/60 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                    {selectedTimeRange ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary-container text-secondary flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[22px]">event_available</span>
                        </div>
                        <div>
                          <div className="font-label-sm uppercase text-[11px] font-semibold text-secondary tracking-wider">
                            Selected Time Slot
                          </div>
                          <div className="font-label-lg font-bold text-primary">
                            {new Date(selectedTimeRange.startTime).toLocaleDateString([], {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            })}
                            {" • "}
                            {new Date(selectedTimeRange.startTime).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: "UTC",
                            })}
                            {" – "}
                            {new Date(selectedTimeRange.endTime).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: "UTC",
                            })}
                            <span className="ml-2 font-normal text-on-surface-variant text-sm">
                              ({selectedTimeRange.slotsCount} hr{selectedTimeRange.slotsCount > 1 ? "s" : ""})
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-on-surface-variant text-sm py-1">
                        <span className="material-symbols-outlined text-[20px] text-primary">touch_app</span>
                        <span>Click or drag across an available green time block above to select your session</span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!selectedTimeRange}
                      onClick={() => setBookingStep(2)}
                      className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-label-md font-semibold flex items-center justify-center gap-2 transition-all ${
                        selectedTimeRange
                          ? "bg-primary text-on-primary hover:bg-primary/90 shadow cursor-pointer active:scale-[0.98]"
                          : "bg-surface-container text-on-surface-variant/40 cursor-not-allowed"
                      }`}
                    >
                      <span>Continue to Details</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              )}

              {bookingStep === 2 && (
                <form onSubmit={handleBookSession} className="space-y-4">
                  <div className="flex items-center gap-2 mb-2 border-b border-surface-container pb-4">
                    <button
                      type="button"
                      onClick={() => {
                        setBookingStep(1);
                      }}
                      className="text-on-surface-variant hover:text-primary transition-colors p-1"
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </button>
                    <h3 className="font-label-lg font-semibold text-primary">Step 2: Intake & Privacy Consent</h3>
                  </div>

                  <div className="bg-surface p-4 rounded-xl space-y-2 border border-outline-variant/40">
                    <div className="flex justify-between items-center text-body-sm">
                      <span className="text-on-surface-variant font-medium">Session Date & Time:</span>
                      <span className="font-bold text-primary">
                        {selectedTimeRange &&
                          `${new Date(selectedTimeRange.startTime).toLocaleDateString([], {
                            dateStyle: "medium",
                            timeZone: "UTC",
                          })} ${new Date(selectedTimeRange.startTime).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: "UTC",
                          })} - ${new Date(selectedTimeRange.endTime).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZone: "UTC",
                          })}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-body-sm">
                      <span className="text-on-surface-variant font-medium">Duration:</span>
                      <span className="font-bold text-primary">{selectedTimeRange?.slotsCount} hr(s)</span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-label-sm text-on-surface-variant mb-1 font-medium">
                      Primary Concern
                    </label>
                    <select
                      value={intakeCategory}
                      onChange={(e) => setIntakeCategory(e.target.value)}
                      className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2.5 font-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      required
                    >
                      <option value="General">General Consultation</option>
                      <option value="Anxiety">Anxiety & Stress</option>
                      <option value="Depression">Depression</option>
                      <option value="Relationship">Relationship Issues</option>
                      <option value="Career">Career & Life Transitions</option>
                      <option value="Trauma">Trauma & PTSD</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-label-sm text-on-surface-variant mb-1 font-medium">
                      Notes for Counselor (Optional)
                    </label>
                    <textarea
                      value={intakeNotes}
                      onChange={(e) => setIntakeNotes(e.target.value)}
                      placeholder="Briefly describe what you'd like to discuss (encrypted at rest)..."
                      className="w-full bg-white border border-outline-variant rounded-xl px-4 py-2.5 font-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[90px]"
                    />
                    <p className="text-[12px] text-on-surface-variant mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-secondary">lock</span>
                      Your notes are end-to-end encrypted and visible only to your counselor.
                    </p>
                  </div>

                  {/* RA 10173 Consent Checkbox */}
                  <div className="p-3 bg-secondary-container/30 border border-secondary-container rounded-xl">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={(e) => setConsentChecked(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded text-primary focus:ring-primary"
                        required
                      />
                      <span className="text-[12px] leading-relaxed text-on-surface">
                        I hereby consent to the collection, secure storage, and confidential processing of my intake information in full accordance with the{" "}
                        <Link href="/privacy-policy" target="_blank" className="text-primary font-bold underline">
                          Data Privacy Act of 2012 (Republic Act No. 10173)
                        </Link>
                        .
                      </span>
                    </label>
                  </div>

                  {/* Honeypot field for bot protection */}
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    autoComplete="off"
                  />

                  <div className="pt-4 border-t border-surface-container">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-label-md text-on-surface-variant font-medium">Total Amount:</span>
                      <span className="font-headline-md text-primary font-bold">
                        ₱
                        {((selectedTimeRange?.slotsCount || 0) * 300).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={isBooking || !consentChecked}
                      className="w-full bg-primary text-on-primary font-label-lg font-bold py-3.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                      {isBooking ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[20px]">
                            progress_activity
                          </span>
                          Confirming Slot...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[20px]">payments</span>
                          Proceed to Payment Details
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FindCounselorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#E1F4F1] flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
        </div>
      }
    >
      <FindCounselorContent />
    </Suspense>
  );
}
