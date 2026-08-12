"use client";

import { useEffect, useState, use } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PublicCounselorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  
  const [counselor, setCounselor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  });
  const [slots, setSlots] = useState<{start: string, end: string}[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    const fetchCounselor = async () => {
      try {
        const data = await api.get(`/counselors/${resolvedParams.id}`);
        setCounselor(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCounselor();
  }, [resolvedParams.id]);

  useEffect(() => {
    if (!counselor) return;
    const fetchSlots = async () => {
      setSlotsLoading(true);
      try {
        const data = await api.get(`/availability/${counselor.id}/slots?date=${selectedDate}`);
        setSlots(data || []);
      } catch (err) {
        console.error(err);
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    };
    fetchSlots();
  }, [counselor, selectedDate]);

  const handleBook = (slotStart: string) => {
    // Instead of a full modal here, we can redirect to a booking flow or 
    // open a simplified modal. Given instructions, we'll redirect to a 
    // hypothetical generic booking flow or simulate it. 
    // Usually there's a Bookings modal in the list page.
    alert(`Initiating booking for ${new Date(slotStart).toLocaleTimeString()}... Please use the main counselors list to complete bookings or implement the modal here.`);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 animate-pulse space-y-8">
        <div className="h-48 bg-surface-variant rounded-xl"></div>
        <div className="h-64 bg-surface-variant rounded-xl"></div>
      </div>
    );
  }

  if (!counselor) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center">
        <p className="text-error font-headline-md mb-4">Counselor not found.</p>
        <Link href="/counselors" className="text-primary hover:underline">
          Back to all counselors
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link href="/counselors" className="inline-flex items-center gap-2 text-primary hover:underline mb-8 font-label-lg">
        <span className="material-symbols-outlined">arrow_back</span> Back to all counselors
      </Link>

      <div className="bg-white rounded-2xl shadow-ambient overflow-hidden mb-8">
        <div className="p-8 sm:p-12 flex flex-col md:flex-row gap-8 items-start">
          <div className="w-32 h-32 md:w-48 md:h-48 bg-surface-container rounded-full flex items-center justify-center text-primary-container shrink-0 text-5xl font-headline-lg overflow-hidden relative border-4 border-white shadow-sm">
            {counselor.photo_url ? (
              <img src={counselor.photo_url} alt={counselor.user?.full_name} className="w-full h-full object-cover" />
            ) : (
              <span>{counselor.user?.full_name ? counselor.user.full_name[0].toUpperCase() : "?"}</span>
            )}
          </div>
          
          <div className="flex-1">
            <h1 className="font-headline-xl text-primary mb-2">{counselor.user?.full_name}</h1>
            <p className="font-body-lg text-on-surface-variant mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-secondary">verified</span>
              Licensed Professional
            </p>

            <div className="mb-6">
              <h2 className="font-label-md text-on-surface-variant uppercase tracking-wider mb-2">Specializations</h2>
              <div className="flex flex-wrap gap-2">
                {counselor.specialization_tags?.length > 0 ? (
                  counselor.specialization_tags.map((tag: string) => (
                    <span key={tag} className="bg-surface-container-high text-on-surface px-3 py-1 rounded-full font-label-sm">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-on-surface-variant italic font-body-sm">No specializations listed.</span>
                )}
              </div>
            </div>

            <div>
              <h2 className="font-label-md text-on-surface-variant uppercase tracking-wider mb-2">About</h2>
              <p className="font-body-md text-on-surface whitespace-pre-wrap">{counselor.bio || "No biography provided."}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-ambient">
        <h2 className="font-headline-lg text-primary mb-6">Book a Session</h2>
        
        <div className="flex flex-col sm:flex-row gap-4 items-end mb-6">
          <div className="w-full sm:w-auto">
            <label className="block font-label-md text-on-surface-variant mb-1">Select Date</label>
            <input 
              type="date" 
              value={selectedDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-[200px] border border-surface-variant rounded-lg p-3 font-body-md"
            />
          </div>
        </div>

        <div>
          {slotsLoading ? (
            <div className="flex gap-4 animate-pulse">
              <div className="h-12 w-24 bg-surface-variant rounded-lg"></div>
              <div className="h-12 w-24 bg-surface-variant rounded-lg"></div>
              <div className="h-12 w-24 bg-surface-variant rounded-lg"></div>
            </div>
          ) : slots.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {slots.map((slot, idx) => (
                <button
                  key={idx}
                  onClick={() => handleBook(slot.start)}
                  className="bg-surface-container-lowest border border-outline-variant text-on-surface px-4 py-3 rounded-lg font-label-md hover:bg-primary hover:text-on-primary hover:border-primary transition-colors text-center"
                >
                  {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant font-body-md bg-surface-container-lowest p-6 rounded-xl border border-outline-variant text-center">
              No available slots on this date.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
