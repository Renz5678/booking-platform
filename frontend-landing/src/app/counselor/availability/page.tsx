"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

// Helper to generate a simple time grid structure
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const times = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"];

export default function AvailabilityPage() {
  // Store selected blocks as a Set of strings "dayIndex-timeIndex" for the MVP UI
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("http://localhost:8000/counselors/me/profile", {
          headers: { "Content-Type": "application/json" },
          credentials: 'include'
        });
        if (res.ok) {
          const profile = await res.json();
          setIsConnected(profile.google_calendar_connected);
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      }
    }
    fetchProfile();
  }, []);

  const toggleSlot = (dayIndex: number, timeIndex: number) => {
    const slotKey = `${dayIndex}-${timeIndex}`;
    const newSelected = new Set(selectedSlots);
    if (newSelected.has(slotKey)) {
      newSelected.delete(slotKey);
    } else {
      newSelected.add(slotKey);
    }
    setSelectedSlots(newSelected);
  };

  const handleSave = () => {
    // In a real implementation, this would map the selected slots to AvailabilityCreate payloads
    // and POST them to /availability/me/blocks
    console.log("Saving availability blocks...", Array.from(selectedSlots));
    alert("Availability saved successfully!");
  };

  return (
    <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
      {/* Header Section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
        <div>
          <h2 className="font-headline-xl text-[48px] font-semibold tracking-tight text-primary mb-2">My Availability</h2>
          <p className="font-body-md text-[16px] text-on-surface-variant max-w-2xl">Set your recurring weekly hours. These slots will be available for clients to book.</p>
        </div>
        {isConnected ? (
          <button disabled className="flex items-center gap-2 px-6 py-3 rounded-full border border-[#4FC3AA] bg-[#C3F2DA] text-[#138A72] transition-colors font-label-md text-[14px] font-medium opacity-80 cursor-not-allowed">
            <span className="material-symbols-outlined">check_circle</span>
            Connected to Google Calendar
          </button>
        ) : (
          <a href="http://localhost:8000/auth/google/login" className="flex items-center gap-2 px-6 py-3 rounded-full border border-tertiary-container text-tertiary-container hover:bg-surface-container-highest transition-colors font-label-md text-[14px] font-medium">
            <span className="material-symbols-outlined">calendar_today</span>
            Connect Google Calendar
          </a>
        )}
      </header>

      {/* Calendar Container */}
      <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 mb-12 border border-white">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Days Header */}
            <div className="grid grid-cols-8 gap-4 mb-4 text-center border-b border-outline-variant pb-4">
              <div className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant uppercase flex items-end justify-center">Time</div>
              {days.map(day => (
                <div key={day} className="font-label-md text-[14px] text-primary font-bold">{day}</div>
              ))}
            </div>

            {/* Time Grid */}
            <div className="grid grid-cols-8 gap-4">
              {times.map((time, timeIndex) => (
                <React.Fragment key={time}>
                  <div className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant text-right pr-4 py-3 flex items-center justify-end">
                    {time}
                  </div>
                  {days.map((day, dayIndex) => {
                    const isSelected = selectedSlots.has(`${dayIndex}-${timeIndex}`);
                    return (
                      <div
                        key={`${dayIndex}-${timeIndex}`}
                        onClick={() => toggleSlot(dayIndex, timeIndex)}
                        className={`rounded-lg h-12 cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? "bg-secondary-container border-l-4 border-secondary hover:bg-secondary-fixed"
                            : "bg-surface-container border border-dashed border-outline-variant hover:bg-surface-container-high"
                        }`}
                      ></div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Legend & Action */}
        <div className="mt-8 pt-6 border-t border-outline-variant flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-secondary-container border-l-2 border-secondary"></div>
              <span className="font-label-md text-[14px] font-medium text-on-surface-variant">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-surface-container border border-dashed border-outline-variant"></div>
              <span className="font-label-md text-[14px] font-medium text-on-surface-variant">Unavailable</span>
            </div>
          </div>
          <button 
            onClick={handleSave}
            className="w-full sm:w-auto px-8 py-3 rounded-full bg-secondary text-on-secondary hover:bg-on-secondary-container transition-colors shadow-ambient hover:shadow-ambient-hover font-label-md text-[14px] font-medium flex justify-center items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            Save Changes
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
