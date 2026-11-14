"use client";

import { useCallback, useEffect, useState } from "react";
import WeeklySlotGrid, {
  buildManilaSlotIso,
  formatLocalDate,
  getManilaHour,
  type WeeklySlotMap,
} from "@/components/dashboard/WeeklySlotGrid";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import type { Booking } from "@/types";

interface RescheduleModalProps {
  booking: Booking;
  onClose: () => void;
  onSuccess: () => void;
}

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

export default function RescheduleModal({
  booking,
  onClose,
  onSuccess,
}: RescheduleModalProps) {
  const { toast } = useToast();
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getMonday(new Date())
  );
  const [weeklySlots, setWeeklySlots] = useState<WeeklySlotMap>({});
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStartHour, setSelectedStartHour] = useState<number | null>(
    null
  );
  const [selectedEndHour, setSelectedEndHour] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchWeekSlots = useCallback(
    async (weekStart: Date) => {
      setLoadingSlots(true);
      try {
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          return formatLocalDate(d);
        });

        const results = await Promise.all(
          days.map(async (dateStr) => {
            try {
              const res = await api.get<{ slots: string[] }>(
                `/availability/${booking.counselor_id}/slots?target_date=${dateStr}`
              );
              const hours = new Set<number>();
              (res.slots || []).forEach((iso) => {
                hours.add(getManilaHour(iso));
              });
              return [dateStr, hours] as const;
            } catch {
              return [dateStr, new Set<number>()] as const;
            }
          })
        );

        const map: WeeklySlotMap = {};
        results.forEach(([dateStr, hours]) => {
          map[dateStr] = hours;
        });
        setWeeklySlots(map);
      } finally {
        setLoadingSlots(false);
      }
    },
    [booking.counselor_id]
  );

  useEffect(() => {
    fetchWeekSlots(currentWeekStart);
  }, [currentWeekStart, fetchWeekSlots]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  const handleConfirm = async () => {
    if (
      !selectedDate ||
      selectedStartHour === null ||
      selectedEndHour === null
    ) {
      toast.error("Please select a new time slot.");
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/bookings/${booking.id}/reschedule`, {
        new_scheduled_start: buildManilaSlotIso(
          selectedDate,
          selectedStartHour
        ),
        new_scheduled_end: buildManilaSlotIso(selectedDate, selectedEndHour),
      });
      toast.success("Session rescheduled successfully.");
      onSuccess();
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Unable to reschedule session. Please choose another slot.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/50 p-4 backdrop-blur-xs animate-fade-in overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border-subtle bg-surface-elevated shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <div>
            <p className="text-xs font-medium text-primary">
              Reschedule Session
            </p>
            <h2
              id="reschedule-modal-title"
              className="font-serif text-xl font-medium text-text-primary"
            >
              Pick a new time with{" "}
              {booking.counselor_name ||
                booking.counselor?.user?.full_name ||
                "your counselor"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close reschedule dialog"
            disabled={submitting}
            onClick={onClose}
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

        <div className="overflow-y-auto p-6 space-y-5">
          <WeeklySlotGrid
            currentWeekStart={currentWeekStart}
            onWeekChange={(nextMonday) => {
              setCurrentWeekStart(nextMonday);
              setSelectedDate("");
              setSelectedStartHour(null);
              setSelectedEndHour(null);
            }}
            availableWeeklySlots={weeklySlots}
            loadingSlots={loadingSlots}
            onSelectRange={(dateStr, minH, maxH) => {
              setSelectedDate(dateStr);
              setSelectedStartHour(minH);
              setSelectedEndHour(maxH + 1);
            }}
            isHighlighted={(dateStr, hour) =>
              dateStr === selectedDate &&
              selectedStartHour !== null &&
              selectedEndHour !== null &&
              hour >= selectedStartHour &&
              hour < selectedEndHour
            }
            highlightLabel="New Time"
          />

          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border-subtle bg-background p-4 sm:flex-row sm:items-center">
            {selectedDate &&
            selectedStartHour !== null &&
            selectedEndHour !== null ? (
              <div>
                <p className="text-xs text-text-muted">
                  New Selected Time (PHT)
                </p>
                <p className="text-sm font-semibold text-text-primary tabular-nums">
                  {selectedDate} &bull; {formatHourLabel(selectedStartHour)}{" "}
                  &ndash; {formatHourLabel(selectedEndHour)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                Select an open slot above to reschedule your booking.
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  submitting ||
                  !selectedDate ||
                  selectedStartHour === null ||
                  selectedEndHour === null
                }
                onClick={handleConfirm}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {submitting ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    />
                    <span>Updating…</span>
                  </>
                ) : (
                  <span>Confirm New Time</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
