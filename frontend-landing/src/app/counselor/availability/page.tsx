"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

// Helper to generate a simple time grid structure
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const times = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"];

export default function AvailabilityPage() {
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [existingBlocks, setExistingBlocks] = useState<AvailabilityBlock[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  // Drag Selection State
  const [isDragging, setIsDragging] = useState(false);
  const [dragAction, setDragAction] = useState<"add" | "remove">("add");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const profileRes = await fetch("http://localhost:8000/counselors/me/profile", {
          headers: { "Content-Type": "application/json" },
          credentials: 'include'
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          setIsConnected(profile.google_calendar_connected);
        }

        const blocksRes = await fetch("http://localhost:8000/availability/me/blocks", {
          credentials: 'include'
        });
        if (blocksRes.ok) {
          const blocks = await blocksRes.json();
          setExistingBlocks(blocks);
          
          const newSet = new Set<string>();
          blocks.forEach((b: AvailabilityBlock) => {
            if (b.is_recurring && b.day_of_week !== null) {
              const startHour = parseInt(b.start_time.split(":")[0]);
              const timeIndex = startHour - 8;
              if (timeIndex >= 0 && timeIndex < times.length) {
                newSet.add(`${b.day_of_week}-${timeIndex}`);
              }
            }
          });
          setSelectedSlots(newSet);
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleMouseDown = (dayIndex: number, timeIndex: number) => {
    setIsDragging(true);
    const slotKey = `${dayIndex}-${timeIndex}`;
    const willAdd = !selectedSlots.has(slotKey);
    setDragAction(willAdd ? "add" : "remove");
    
    const newSelected = new Set(selectedSlots);
    if (willAdd) newSelected.add(slotKey);
    else newSelected.delete(slotKey);
    setSelectedSlots(newSelected);
  };

  const handleMouseEnter = (dayIndex: number, timeIndex: number) => {
    if (!isDragging) return;
    const slotKey = `${dayIndex}-${timeIndex}`;
    const newSelected = new Set(selectedSlots);
    if (dragAction === "add") newSelected.add(slotKey);
    else newSelected.delete(slotKey);
    setSelectedSlots(newSelected);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Delete all existing blocks (simple sync approach)
      for (const block of existingBlocks) {
        await fetch(`http://localhost:8000/availability/me/blocks/${block.id}`, {
          method: "DELETE",
          credentials: 'include'
        });
      }

      // 2. Create new blocks
      const createdBlocks = [];
      for (const slotKey of selectedSlots) {
        const [dayIndexStr, timeIndexStr] = slotKey.split("-");
        const dayIndex = parseInt(dayIndexStr);
        const timeIndex = parseInt(timeIndexStr);
        
        const startHour = 8 + timeIndex;
        const endHour = startHour + 1;
        
        const payload = {
          day_of_week: dayIndex,
          start_time: `${startHour.toString().padStart(2, '0')}:00:00`,
          end_time: `${endHour.toString().padStart(2, '0')}:00:00`,
          is_recurring: true
        };

        const res = await fetch("http://localhost:8000/availability/me/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        
        if (res.ok) {
          createdBlocks.push(await res.json());
        }
      }
      
      setExistingBlocks(createdBlocks);
      alert("Availability saved successfully!");
    } catch (err) {
      console.error("Failed to save:", err);
      alert("Failed to save availability.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
      {/* Header Section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h2 className="font-headline-xl text-[48px] font-semibold tracking-tight text-primary mb-2">My Availability</h2>
          <p className="font-body-md text-[16px] text-on-surface-variant max-w-2xl">Set your recurring weekly hours. These slots will be available for clients to book. Click and drag to easily select times.</p>
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
      {isLoading ? (
        <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-12 mb-8 border border-white flex flex-col items-center justify-center min-h-[400px]">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-4">progress_activity</span>
          <p className="font-label-md text-on-surface-variant">Loading your availability...</p>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-4 mb-8 border border-white select-none">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Days Header */}
              <div className="grid grid-cols-8 gap-2 mb-2 text-center border-b border-outline-variant pb-2">
              <div className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant uppercase flex items-end justify-center">Time</div>
              {days.map(day => (
                <div key={day} className="font-label-md text-[14px] text-primary font-bold">{day}</div>
              ))}
            </div>

            {/* Time Grid */}
            <div className="grid grid-cols-8 gap-2">
              {times.map((time, timeIndex) => (
                <React.Fragment key={time}>
                  <div className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant text-right pr-2 py-1 flex items-center justify-end">
                    {time}
                  </div>
                  {days.map((day, dayIndex) => {
                    const isSelected = selectedSlots.has(`${dayIndex}-${timeIndex}`);
                    return (
                      <div
                        key={`${dayIndex}-${timeIndex}`}
                        onMouseDown={() => handleMouseDown(dayIndex, timeIndex)}
                        onMouseEnter={() => handleMouseEnter(dayIndex, timeIndex)}
                        className={`rounded h-8 cursor-pointer transition-colors duration-100 ${
                          isSelected
                            ? "bg-secondary-container border-l-4 border-secondary"
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
        <div className="mt-4 pt-4 border-t border-outline-variant flex flex-col sm:flex-row justify-between items-center gap-4">
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
            disabled={isSaving}
            className="w-full sm:w-auto px-8 py-3 rounded-full bg-secondary text-on-secondary hover:bg-on-secondary-container transition-colors shadow-ambient hover:shadow-ambient-hover font-label-md text-[14px] font-medium flex justify-center items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">save</span>
            )}
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
      )}
    </DashboardLayout>
  );
}
