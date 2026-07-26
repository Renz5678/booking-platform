"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Booking {
  id: string;
  client_name: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  meeting_link?: string;
}

export default function CounselorDashboardPage() {
  const [lastName, setLastName] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [newBookings, setNewBookings] = useState(0);
  const [todaysBookings, setTodaysBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch User Info
        const userRes = await fetch("http://localhost:8000/auth/me", {
          headers: { "Content-Type": "application/json" },
          credentials: 'include'
        });
        if (userRes.ok) {
          const user = await userRes.json();
          const names = user.full_name?.split(" ");
          setLastName(names && names.length > 1 ? names[names.length - 1] : user.full_name);
          setIsActive(user.is_active);
        }

        // Fetch Bookings
        const bookingsRes = await fetch("http://localhost:8000/bookings/counselor/me", {
          headers: { "Content-Type": "application/json" },
          credentials: 'include'
        });
        
        if (bookingsRes.ok) {
          const bookings: Booking[] = await bookingsRes.json();
          
          const now = new Date();
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
          const endOfWeek = new Date(now);
          endOfWeek.setDate(now.getDate() + (6 - now.getDay())); // Saturday
          endOfWeek.setHours(23, 59, 59, 999);
          
          const startOfDay = new Date(now);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(now);
          endOfDay.setHours(23, 59, 59, 999);

          const weekSessions = bookings.filter(b => {
            const d = new Date(b.scheduled_start);
            return d >= startOfWeek && d <= endOfWeek && (b.status === "confirmed" || b.status === "completed" || b.status === "pending_payment");
          });
          
          const newB = bookings.filter(b => b.status === "pending_payment" || b.status === "confirmed");
          
          const todaySessions = bookings.filter(b => {
            const d = new Date(b.scheduled_start);
            return d >= startOfDay && d <= endOfDay && (b.status === "confirmed" || b.status === "pending_payment" || b.status === "completed");
          }).sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());

          setSessionsThisWeek(weekSessions.length);
          setNewBookings(newB.length);
          setTodaysBookings(todaySessions);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const formatTimeRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    return `${s.toLocaleTimeString('en-US', options)} - ${e.toLocaleTimeString('en-US', options)}`;
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
  };

  return (
    <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
      {loading ? (
        <div className="py-12 flex justify-center items-center">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <>
          {/* Welcome Header & Banner */}
          <header className="space-y-6">
            <div>
              <h1 className="font-headline-lg-mobile md:font-headline-lg text-[28px] md:text-[32px] font-semibold tracking-tight text-primary">
                Good morning{lastName ? `, Dr. ${lastName}` : "."}
              </h1>
              <p className="font-body-md text-[16px] text-on-surface-variant mt-2">Here's an overview of your practice today.</p>
            </div>
            
            {/* Status Banner */}
            <div className={`rounded-lg p-4 flex items-center gap-3 border shadow-sm ${isActive ? 'bg-[#C3F2DA] border-[#4FC3AA]' : 'bg-surface-variant border-outline-variant'}`}>
              <div className={`${isActive ? 'bg-secondary text-on-secondary' : 'bg-on-surface-variant text-surface'} rounded-full p-1.5 flex items-center justify-center shrink-0`}>
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isActive ? 'check_circle' : 'info'}
                </span>
              </div>
              <p className={`font-label-md text-[14px] font-medium ${isActive ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                {isActive ? 'Your profile is currently active and visible to new clients.' : 'Your profile is pending admin verification or inactive.'}
              </p>
            </div>
          </header>

          {/* Snapshot Row (Bento Grid Style) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            {/* Card 1 */}
            <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 cursor-pointer border border-white">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-surface-container-low p-3 rounded-lg text-primary">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
                </div>
                <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">arrow_outward</span>
              </div>
              <div>
                <h3 className="font-headline-lg text-[32px] font-semibold text-primary mb-1">{sessionsThisWeek}</h3>
                <p className="font-label-md text-[14px] font-medium text-on-surface-variant">Sessions This Week</p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 cursor-pointer border border-white">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-surface-container-low p-3 rounded-lg text-primary">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>edit_document</span>
                </div>
                <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">arrow_outward</span>
              </div>
              <div>
                <h3 className="font-headline-lg text-[32px] font-semibold text-primary mb-1">0</h3>
                <p className="font-label-md text-[14px] font-medium text-on-surface-variant">Pending Notes</p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300 cursor-pointer border border-white">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-secondary-container p-3 rounded-lg text-on-secondary-container">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>notification_add</span>
                </div>
                <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">arrow_outward</span>
              </div>
              <div>
                <h3 className="font-headline-lg text-[32px] font-semibold text-primary mb-1">{newBookings}</h3>
                <p className="font-label-md text-[14px] font-medium text-on-surface-variant">Active Bookings</p>
              </div>
            </div>
          </section>

          {/* Today's Schedule */}
          <section className="bg-surface-container-lowest rounded-xl shadow-ambient p-6 md:p-8 border border-white mt-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-surface-container">
              <h2 className="font-headline-md text-[24px] font-medium text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">today</span>
                Today's Schedule
              </h2>
              <button className="font-label-sm text-[12px] font-semibold tracking-wider text-secondary hover:underline">View Full Calendar</button>
            </div>

            <div className="space-y-4">
              {todaysBookings.length > 0 ? (
                todaysBookings.map((booking, idx) => {
                  const isNextUp = idx === 0 && new Date(booking.scheduled_start) > new Date();
                  
                  return (
                    <div key={booking.id} className={`${isNextUp ? 'bg-surface-bright border-surface-container-high relative overflow-hidden group' : 'bg-surface border-transparent hover:border-surface-container-highest transition-colors'} border rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                      {isNextUp && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-secondary"></div>}
                      
                      <div className={`flex items-center gap-4 ${isNextUp ? 'pl-2' : 'pl-3.5'}`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isNextUp ? 'bg-surface-container' : 'bg-surface-container-high text-on-surface-variant font-headline-md text-[24px] font-medium'}`}>
                          {isNextUp ? (
                            <span className="material-symbols-outlined text-on-surface-variant">person</span>
                          ) : (
                            getInitials(booking.client_name)
                          )}
                        </div>
                        <div>
                          <h4 className="font-label-md text-[14px] font-bold text-primary">{booking.client_name}</h4>
                          <div className="flex items-center gap-3 mt-1 font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">schedule</span> {formatTimeRange(booking.scheduled_start, booking.scheduled_end)}</span>
                            <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">videocam</span> Video Call</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {isNextUp && <span className="bg-secondary-container text-on-secondary-container px-2 py-1 rounded font-label-sm text-[12px] font-semibold tracking-wider mr-2 hidden md:inline-block">Next Up</span>}
                        {booking.meeting_link && booking.status !== "completed" ? (
                          <a href={booking.meeting_link} target="_blank" rel="noopener noreferrer" className={`${isNextUp ? 'bg-secondary text-on-secondary hover:opacity-90 shadow-sm' : 'text-primary border border-outline-variant hover:bg-surface-container-low transition-colors'} text-center font-label-md text-[14px] font-medium px-6 py-2.5 rounded-lg w-full md:w-auto block`}>
                            Join Session
                          </a>
                        ) : (
                          <button className="text-primary border border-outline-variant font-label-md text-[14px] font-medium px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors w-full md:w-auto">Review Intake</button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[48px] opacity-50 mb-2">event_busy</span>
                  <p>You have no sessions scheduled for today.</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </DashboardLayout>
  );
}
