"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

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
  
  // Booking Form State
  const [scheduledStart, setScheduledStart] = useState("");
  const [intakeCategory, setIntakeCategory] = useState("General");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    const fetchCounselors = async () => {
      try {
        const res = await fetch("http://localhost:8000/counselors");
        if (res.ok) {
          const data = await res.json();
          setCounselors(data);
        }
      } catch (err) {
        console.error("Failed to fetch counselors:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCounselors();
  }, []);

  const openBookingModal = (counselor: CounselorProfile) => {
    setSelectedCounselor(counselor);
    
    // Set default time to tomorrow at 10 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    // Format for datetime-local input: YYYY-MM-DDThh:mm
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(tomorrow.getTime() - tzoffset)).toISOString().slice(0, 16);
    
    setScheduledStart(localISOTime);
    setIsModalOpen(true);
  };

  const handleBookSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCounselor) return;

    setIsBooking(true);
    
    // Calculate end time (50 mins later)
    const start = new Date(scheduledStart);
    const end = new Date(start.getTime() + 50 * 60000);

    const payload = {
      counselor_id: selectedCounselor.id,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      intake_concern_category: intakeCategory,
      intake_notes: intakeNotes
    };

    try {
      const res = await fetch("http://localhost:8000/bookings/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        // Redirect to PayMongo checkout
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
        } else {
          alert("Booking created successfully, but no checkout URL returned.");
          setIsModalOpen(false);
        }
      } else {
        const errorData = await res.json();
        alert(`Failed to book session: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error("Booking error:", err);
      alert("An error occurred while booking. Please try again.");
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
            <div className="bg-surface-container-lowest rounded-xl max-w-md w-full p-6 shadow-ambient">
              <div className="flex justify-between items-center mb-6 border-b border-surface-container pb-4">
                <h2 className="font-headline-md text-[20px] font-medium text-primary">Book with {selectedCounselor.user.full_name}</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <form onSubmit={handleBookSession} className="space-y-4">
                <div>
                  <label className="block font-label-sm text-[14px] text-on-surface-variant mb-1">Session Date & Time</label>
                  <input 
                    type="datetime-local" 
                    value={scheduledStart}
                    onChange={(e) => setScheduledStart(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 font-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    required
                  />
                  <p className="font-label-sm text-[12px] text-outline mt-1">Sessions are 50 minutes long.</p>
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
                    <span className="font-headline-md text-primary font-bold">₱1,500.00</span>
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
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
