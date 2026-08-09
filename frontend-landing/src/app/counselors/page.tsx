"use client";

import React, { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api, ApiError } from "@/lib/api";

interface CounselorProfile {
  id: string;
  bio: string | null;
  specialization_tags: string[];
  user: {
    id: string;
    full_name: string;
  };
}

export default function FindCounselorPage() {
  const [counselors, setCounselors] = useState<CounselorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Booking Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCounselor, setSelectedCounselor] = useState<CounselorProfile | null>(null);
  
  // Wizard State
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  
  // Booking Form State
  const duration = 60; // Fixed to hourly basis
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d;
  });
  const [availableWeeklySlots, setAvailableWeeklySlots] = useState<Record<string, { available: string[], occupied: string[] }>>({});
  const [dragSelection, setDragSelection] = useState<{ dateStr: string, startHour: number, endHour: number } | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<{ dateStr: string, startTime: string, endTime: string, slotsCount: number } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  // selectedTime removed in favor of selectedTimeRange
  
  const [intakeCategory, setIntakeCategory] = useState("General");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    const fetchCounselors = async () => {
      try {
        const data = await api.get("/counselors");
        setCounselors(data);
      } catch (err) {
        console.error("Failed to fetch counselors:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCounselors();
  }, []);

  useEffect(() => {
    if (isModalOpen && selectedCounselor) {
      const fetchSlots = async () => {
        setLoadingSlots(true);
        try {
          const start = new Date(currentWeekStart);
          const end = new Date(currentWeekStart);
          end.setDate(end.getDate() + 6);
          const startDateStr = start.toISOString().split('T')[0];
          const endDateStr = end.toISOString().split('T')[0];

          const data = await api.get(`/availability/${selectedCounselor.id}/slots?start_date=${startDateStr}&end_date=${endDateStr}&duration=${duration}`);
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
    setSelectedCounselor(counselor);
    
    // Reset to current week
    const d = new Date();
    d.setHours(0,0,0,0);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    setCurrentWeekStart(d);
    
    setBookingStep(1);
    setSelectedTimeRange(null);
    setDragSelection(null);
    setIsModalOpen(true);
  };

  const handleBookSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCounselor || !selectedTimeRange) return;

    setIsBooking(true);
    
    // Calculate end time
    const start = new Date(selectedTimeRange.startTime);
    const end = new Date(selectedTimeRange.endTime);

    const payload = {
      counselor_id: selectedCounselor.id,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      intake_concern_category: intakeCategory,
      intake_notes: intakeNotes,
      captcha_token: "mock_captcha_token",
      honeypot: ""
    };

    try {
      const data = await api.post("/bookings/", payload);
      
      // Redirect to PayMongo checkout
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        alert("Booking created successfully, but no checkout URL returned.");
        setIsModalOpen(false);
      }
    } catch (err: unknown) {
      console.error("Booking error:", err);
      if (err instanceof ApiError) {
        alert(`Failed to book session: ${err.message}`);
      } else {
        alert("An error occurred while booking. Please try again.");
      }
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <div className="max-w-5xl mx-auto">
        <h1 className="font-headline-xl text-primary mb-2">Find a Counselor</h1>
        <p className="font-body-lg text-on-surface-variant mb-8">Browse our network of professional therapists and book a session today.</p>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-surface-variant/20 animate-pulse"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-1/2 bg-surface-variant/30 rounded animate-pulse"></div>
                    <div className="h-3 w-1/3 bg-surface-variant/20 rounded animate-pulse"></div>
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  <div className="h-4 w-full bg-surface-variant/20 rounded animate-pulse"></div>
                  <div className="h-4 w-5/6 bg-surface-variant/20 rounded animate-pulse"></div>
                  <div className="h-4 w-4/6 bg-surface-variant/20 rounded animate-pulse"></div>
                </div>
                <div className="flex gap-2 mb-6">
                  <div className="h-6 w-20 bg-surface-variant/30 rounded-full animate-pulse"></div>
                  <div className="h-6 w-24 bg-surface-variant/30 rounded-full animate-pulse"></div>
                </div>
                <div className="h-12 w-full bg-surface-variant/30 rounded-lg animate-pulse"></div>
              </div>
            ))}
          </div>
        ) : counselors.length === 0 ? (
          <div className="bg-surface-container-low p-8 rounded-xl text-center text-on-surface-variant">
            No counselors are currently available. Please check back later!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {counselors.map((counselor) => (
              <div key={counselor.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-primary-container text-2xl shrink-0">
                    <span className="material-symbols-outlined">person</span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-primary font-bold">{counselor.user.full_name}</h3>
                    <p className="font-label-sm text-on-surface-variant">Licensed Counselor</p>
                  </div>
                </div>
                <p className="font-body-md text-on-surface-variant line-clamp-3 mb-4 flex-1">
                  {counselor.bio || "No biography provided yet."}
                </p>
                <div className="flex flex-wrap gap-2 mb-6 min-h-[28px]">
                  {counselor.specialization_tags.map(tag => (
                    <span key={tag} className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm">
                      {tag}
                    </span>
                  ))}
                  {counselor.specialization_tags.length === 0 && (
                    <span className="text-on-surface-variant italic font-label-sm">General Counseling</span>
                  )}
                </div>
                <button 
                  onClick={() => openBookingModal(counselor)}
                  className="w-full bg-secondary text-on-secondary font-label-md py-3 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-sm"
                >
                  Book Session
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Booking Modal */}
        {isModalOpen && selectedCounselor && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className={`bg-surface-container-lowest rounded-xl w-full p-6 shadow-ambient max-h-[95vh] overflow-y-auto ${bookingStep === 1 ? 'max-w-4xl' : 'max-w-lg'}`}>
              <div className="flex justify-between items-center mb-6 border-b border-surface-container pb-4">
                <h2 className="font-headline-md text-[20px] font-medium text-primary">Book with {selectedCounselor.user.full_name}</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              {bookingStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h3 className="font-label-lg font-semibold text-primary mb-1">Step 1: Select Time</h3>
                      <p className="font-body-sm text-on-surface-variant">Pick an available time block for a 1-hour session.</p>
                    </div>
                  </div>

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
                                const startD = new Date(`${dragSelection.dateStr}T${minHour.toString().padStart(2, '0')}:00:00Z`);
                                const endD = new Date(`${dragSelection.dateStr}T${(maxHour + 1).toString().padStart(2, '0')}:00:00Z`);
                                setSelectedTimeRange({
                                  dateStr: dragSelection.dateStr,
                                  startTime: startD.toISOString(),
                                  endTime: endD.toISOString(),
                                  slotsCount: (maxHour - minHour) + 1
                                });
                                setBookingStep(3);
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
                                      className={`h-10 transition-colors cursor-pointer text-[10px] font-bold flex items-center justify-center select-none shadow-sm ${isSelected ? 'bg-primary text-on-primary' : 'bg-secondary-container text-on-secondary-container hover:bg-[#65de7e]'}`}
                                    >
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div
                                      key={`${dayIndex}-${timeIndex}`}
                                      className="h-10 bg-surface-container border-x border-dashed border-outline-variant/50 flex items-center justify-center opacity-50"
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
                </div>
              )}

              {bookingStep === 3 && (
                <form onSubmit={handleBookSession} className="space-y-4 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2 border-b border-surface-container pb-4">
                    <button type="button" onClick={() => { setSelectedTimeRange(null);
    setDragSelection(null); setBookingStep(1); }} className="text-on-surface-variant hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </button>
                    <h3 className="font-label-lg font-semibold text-primary">Step 2: Intake Details</h3>
                  </div>

                  <div className="bg-surface-container p-4 rounded-lg mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-label-sm text-on-surface-variant">Selected Time:</span>
                      <span className="font-label-md text-primary font-medium">{selectedTimeRange && `${new Date(selectedTimeRange.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} - ${new Date(selectedTimeRange.endTime).toLocaleString([], { timeStyle: 'short' })}`}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-label-sm text-on-surface-variant">Duration:</span>
                      <span className="font-label-md text-primary font-medium">{selectedTimeRange?.slotsCount} hr(s)</span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-label-sm text-[14px] text-on-surface-variant mb-1">Primary Concern</label>
                    <select 
                      value={intakeCategory}
                      onChange={(e) => setIntakeCategory(e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 font-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
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
                    <label className="block font-label-sm text-[14px] text-on-surface-variant mb-1">Notes for Counselor (Optional)</label>
                    <textarea 
                      value={intakeNotes}
                      onChange={(e) => setIntakeNotes(e.target.value)}
                      placeholder="Briefly describe what you'd like to discuss..."
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 font-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[80px]"
                    />
                  </div>
                  
                  <div className="pt-4 border-t border-surface-container">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-label-md text-on-surface-variant">Total Amount:</span>
                      <span className="font-headline-md text-primary font-bold">
                        ₱{((selectedTimeRange?.slotsCount || 0) * 300).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <button 
                      type="submit"
                      disabled={isBooking}
                      className="w-full bg-primary text-on-primary font-label-lg font-bold py-3.5 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-sm disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                      {isBooking ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                          Processing...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[20px]">lock</span>
                          Proceed to Secure Payment
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
    </DashboardLayout>
  );
}
