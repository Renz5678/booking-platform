"use client";

import React, { useEffect, useState } from "react";
import { Booking } from "@/types";
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
  
  const [availableWeeklySlots, setAvailableWeeklySlots] = useState<Record<string, { available: string[], occupied: string[] }>>({});
  const [dragSelection, setDragSelection] = useState<{ dateStr: string, startHour: number, endHour: number } | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<{ dateStr: string, startHour: number, endHour: number } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Calculate required duration in hours based on original booking
  const originalStart = new Date(booking.scheduled_start);
  const originalEnd = new Date(booking.scheduled_end);
  const durationHours = Math.round((originalEnd.getTime() - originalStart.getTime()) / (1000 * 60 * 60));
  const durationMinutes = durationHours * 60;

  useEffect(() => {
    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        const start = new Date(currentWeekStart);
        const end = new Date(currentWeekStart);
        end.setDate(end.getDate() + 6);
        const startDateStr = start.toISOString().split('T')[0];
        const endDateStr = end.toISOString().split('T')[0];

        const data = await api.get(`/availability/${booking.counselor_id}/slots?start_date=${startDateStr}&end_date=${endDateStr}&duration=60&exclude_booking_id=${booking.id}`);
        setAvailableWeeklySlots(data || {});
      } catch (err) {
        console.error("Failed to fetch slots:", err);
        setAvailableWeeklySlots({});
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchSlots();
  }, [currentWeekStart, booking.counselor_id, durationMinutes]);

  const handleConfirmReschedule = async (dateStr: string, startHour: number, endHour: number) => {
    const slotsCount = (endHour - startHour) + 1;
    if (slotsCount !== durationHours) {
      setErrorMsg(`You must select exactly ${durationHours} hour(s) to match your original booking.`);
      return;
    }
    
    setErrorMsg("");
    setIsSubmitting(true);
    
    const startD = new Date(`${dateStr}T${startHour.toString().padStart(2, '0')}:00:00Z`);
    const endD = new Date(`${dateStr}T${(endHour + 1).toString().padStart(2, '0')}:00:00Z`);
    
    try {
      await api.put(`/bookings/${booking.id}/reschedule`, {
        new_scheduled_start: startD.toISOString(),
        new_scheduled_end: endD.toISOString(),
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
            <h2 className="font-headline-md text-[20px] font-medium text-primary">Reschedule Session</h2>
            <p className="font-body-sm text-on-surface-variant">Please select {durationHours} hour(s) to match your original booking.</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
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
          <div className="flex justify-between items-center bg-surface p-3 rounded-lg border border-outline-variant">
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
            <span className="font-label-lg text-primary font-medium">
              Week of {currentWeekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })}
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

          <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface relative min-h-[300px]">
            {loadingSlots && (
              <div className="absolute inset-0 bg-surface/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
              </div>
            )}
            
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 py-4 border-b border-surface-container bg-surface-container-lowest">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-secondary-container"></div>
                <span className="font-label-sm text-on-surface-variant">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-400"></div>
                <span className="font-label-sm text-on-surface-variant">Current Booking</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-primary"></div>
                <span className="font-label-sm text-on-surface-variant">Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-error"></div>
                <span className="font-label-sm text-on-surface-variant">Occupied</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-surface-container border border-dashed border-outline-variant/50"></div>
                <span className="font-label-sm text-on-surface-variant">Unavailable</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[700px] p-4">
                <div className="grid grid-cols-8 gap-2 mb-2 text-center border-b border-outline-variant pb-2">
                  <div className="font-label-sm text-[12px] font-semibold text-on-surface-variant uppercase flex items-end justify-center">Time</div>
                  {Array.from({length: 7}).map((_, i) => {
                    const d = new Date(currentWeekStart);
                    d.setDate(d.getDate() + i);
                    const dayName = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i];
                    const isToday = d.toDateString() === new Date().toDateString();
                    return (
                      <div key={i} className={`flex flex-col items-center ${isToday ? 'text-secondary' : 'text-primary'}`}>
                        <span className="font-label-sm uppercase opacity-70">{dayName}</span>
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
                        const hasSlot = slotsForDay.some(slotStr => new Date(slotStr).getUTCHours() === h);
                        if (!hasSlot) { allAvailable = false; break; }
                      }
                      
                      if (allAvailable) {
                        const slotsCount = (maxHour - minHour) + 1;
                        if (slotsCount !== durationHours) {
                          setErrorMsg(`You must select exactly ${durationHours} hour(s).`);
                        } else {
                          setErrorMsg("");
                          setPendingReschedule({ dateStr: dragSelection.dateStr, startHour: minHour, endHour: maxHour });
                        }
                      }
                      setDragSelection(null);
                    }
                  }}
                  onMouseLeave={() => setDragSelection(null)}
                >
                  {["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"].map((time, timeIndex) => (
                    <React.Fragment key={time}>
                      <div className="font-label-sm text-[12px] font-semibold text-on-surface-variant text-right pr-2 py-1 flex items-center justify-end h-10">
                        {time}
                      </div>
                      {Array.from({length: 7}).map((_, dayIndex) => {
                        const d = new Date(currentWeekStart);
                        d.setDate(d.getDate() + dayIndex);
                        const dateStr = d.toISOString().split('T')[0];
                        
                        const startHour = 8 + timeIndex;
                        const slotTimeIsoStr = `${dateStr}T${startHour.toString().padStart(2, '0')}:00:00Z`;
                        
                        const slotsForDay = availableWeeklySlots[dateStr] || { available: [], occupied: [] };
                        
                        const isAvailable = slotsForDay.available?.some(slotStr => new Date(slotStr).getUTCHours() === startHour);
                        const isOccupied = slotsForDay.occupied?.some(slotStr => new Date(slotStr).getUTCHours() === startHour);
                        
                        const isPast = new Date(slotTimeIsoStr) < new Date();

                        const isSelected = dragSelection && 
                          dragSelection.dateStr === dateStr && 
                          startHour >= Math.min(dragSelection.startHour, dragSelection.endHour) && 
                          startHour <= Math.max(dragSelection.startHour, dragSelection.endHour);

                        const isOriginalBooking = (
                          new Date(slotTimeIsoStr).getTime() >= originalStart.getTime() &&
                          new Date(slotTimeIsoStr).getTime() < originalEnd.getTime()
                        );
                        
                        const isPending = pendingReschedule && 
                          pendingReschedule.dateStr === dateStr &&
                          startHour >= pendingReschedule.startHour &&
                          startHour <= pendingReschedule.endHour;
                          
                        const isYellow = isPending || (!pendingReschedule && isOriginalBooking);

                        if (isOccupied && !isPast) {
                          return (
                            <div
                              key={`${dayIndex}-${timeIndex}`}
                              className="h-10 bg-error flex items-center justify-center shadow-sm"
                            >
                            </div>
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
                              className={`h-10 transition-colors cursor-pointer text-[10px] font-bold flex items-center justify-center select-none shadow-sm ${
                                isSelected 
                                  ? 'bg-primary text-on-primary' 
                                  : isYellow 
                                    ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'
                                    : 'bg-secondary-container text-on-secondary-container hover:bg-[#65de7e]'
                              }`}
                            >
                            </div>
                          );
                        } else {
                          return (
                            <div
                              key={`${dayIndex}-${timeIndex}`}
                              className="h-10 bg-surface-container border border-dashed border-outline-variant/50"
                            >
                            </div>
                          );
                        }
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {isSubmitting && (
            <div className="text-center font-label-md text-primary animate-pulse py-2">
              Processing your reschedule request...
            </div>
          )}
          
          {pendingReschedule && !isSubmitting && (
            <div className="flex flex-col sm:flex-row items-center justify-between bg-surface-container-low p-4 rounded-xl border border-outline-variant mt-4 animate-fade-in">
              <div className="mb-4 sm:mb-0">
                <h4 className="font-headline-sm text-[18px] text-primary">Confirm New Schedule?</h4>
                <p className="font-body-sm text-on-surface-variant">Are you sure you want to move your booking to this new time?</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setPendingReschedule(null)}
                  className="px-5 py-2.5 rounded-full border border-outline text-on-surface font-label-md hover:bg-surface-variant transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleConfirmReschedule(pendingReschedule.dateStr, pendingReschedule.startHour, pendingReschedule.endHour)}
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
