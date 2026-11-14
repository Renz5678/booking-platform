"use client";

import { useEffect, useState } from "react";
import { Booking } from "@/types";
import WeeklySlotGrid, {
  WeeklySlotMap,
  buildManilaSlotIso,
  formatLocalDate,
} from "@/components/dashboard/WeeklySlotGrid";
import { api } from "@/lib/api";

interface RescheduleModalProps {
  booking: Booking;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RescheduleModal({ booking, onClose, onSuccess }: RescheduleModalProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d;
  });

  const [availableWeeklySlots, setAvailableWeeklySlots] = useState<WeeklySlotMap>({});
  const [pendingReschedule, setPendingReschedule] = useState<{
    dateStr: string;
    startHour: number;
    endHour: number;
  } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Calculate required duration in hours based on original booking
  const originalStart = new Date(booking.scheduled_start);
  const originalEnd = new Date(booking.scheduled_end);
  const durationHours = Math.round(
    (originalEnd.getTime() - originalStart.getTime()) / (1000 * 60 * 60)
  );
  const durationMinutes = durationHours * 60;

  useEffect(() => {
    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        const start = new Date(currentWeekStart);
        const end = new Date(currentWeekStart);
        end.setDate(end.getDate() + 6);
        const startDateStr = formatLocalDate(start);
        const endDateStr = formatLocalDate(end);

        const data = await api.get(
          `/availability/${booking.counselor_id}/slots?start_date=${startDateStr}&end_date=${endDateStr}&duration=60&exclude_booking_id=${booking.id}`
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
  }, [currentWeekStart, booking.counselor_id, booking.id, durationMinutes]);

  const handleConfirmReschedule = async (
    dateStr: string,
    startHour: number,
    endHour: number
  ) => {
    const slotsCount = endHour - startHour + 1;
    if (slotsCount !== durationHours) {
      setErrorMsg(
        `You must select exactly ${durationHours} hour(s) to match your original booking.`
      );
      return;
    }

    setErrorMsg("");
    setIsSubmitting(true);

    try {
      await api.put(`/bookings/${booking.id}/reschedule`, {
        new_scheduled_start: buildManilaSlotIso(dateStr, startHour),
        new_scheduled_end: buildManilaSlotIso(dateStr, endHour + 1),
      });

      onSuccess();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred while rescheduling.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-xl w-full p-6 shadow-ambient max-h-[95vh] overflow-y-auto max-w-4xl">
        <div className="flex justify-between items-center mb-6 border-b border-surface-container pb-4">
          <div>
            <h2 className="font-headline-md text-[20px] font-medium text-primary">
              Reschedule Session
            </h2>
            <p className="font-body-sm text-on-surface-variant">
              Please select {durationHours} hour(s) to match your original booking.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="h-12 mb-4">
          {errorMsg && (
            <div className="p-3 bg-error-container text-error rounded-lg font-label-md h-full flex items-center">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="space-y-6 animate-fade-in">
          <WeeklySlotGrid
            currentWeekStart={currentWeekStart}
            onWeekChange={setCurrentWeekStart}
            availableWeeklySlots={availableWeeklySlots}
            loadingSlots={loadingSlots}
            highlightLabel="Current Booking"
            isHighlighted={(dateStr, startHour, slotTimeIsoStr) => {
              const slotTime = new Date(slotTimeIsoStr).getTime();
              const isOriginalBooking =
                slotTime >= originalStart.getTime() && slotTime < originalEnd.getTime();
              const isPending = Boolean(
                pendingReschedule &&
                  pendingReschedule.dateStr === dateStr &&
                  startHour >= pendingReschedule.startHour &&
                  startHour <= pendingReschedule.endHour
              );
              return isPending || (!pendingReschedule && isOriginalBooking);
            }}
            onSelectRange={(dateStr, minHour, maxHour) => {
              const slotsCount = maxHour - minHour + 1;
              if (slotsCount !== durationHours) {
                setErrorMsg(`You must select exactly ${durationHours} hour(s).`);
              } else {
                setErrorMsg("");
                setPendingReschedule({ dateStr, startHour: minHour, endHour: maxHour });
              }
            }}
          />
          {isSubmitting && (
            <div className="text-center font-label-md text-primary animate-pulse py-2">
              Processing your reschedule request...
            </div>
          )}

          {pendingReschedule && !isSubmitting && (
            <div className="flex flex-col sm:flex-row items-center justify-between bg-surface-container-low p-4 rounded-xl border border-outline-variant mt-4 animate-fade-in">
              <div className="mb-4 sm:mb-0">
                <h4 className="font-headline-sm text-[18px] text-primary">
                  Confirm New Schedule?
                </h4>
                <p className="font-body-sm text-on-surface-variant">
                  Are you sure you want to move your booking to this new time?
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingReschedule(null)}
                  className="px-5 py-2.5 rounded-full border border-outline text-on-surface font-label-md hover:bg-surface-variant transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    handleConfirmReschedule(
                      pendingReschedule.dateStr,
                      pendingReschedule.startHour,
                      pendingReschedule.endHour
                    )
                  }
                  className="px-5 py-2.5 rounded-full bg-primary text-on-primary font-label-md shadow-sm hover:opacity-90 transition-opacity"
                >
                  Confirm Reschedule
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
