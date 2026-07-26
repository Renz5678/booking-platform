"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Booking {
  id: string;
  counselor_name: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  meeting_link?: string;
}

export default function ClientDashboardPage() {
  const [firstName, setFirstName] = useState("");
  const [upcomingBooking, setUpcomingBooking] = useState<Booking | null>(null);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState(false);

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
          setFirstName(user.full_name?.split(" ")[0] || "there");
          setCalendarConnected(user.google_calendar_connected || false);
        }

        // Fetch Bookings
        const bookingsRes = await fetch("http://localhost:8000/bookings/me", {
          headers: { "Content-Type": "application/json" },
          credentials: 'include'
        });
        if (bookingsRes.ok) {
          const bookings: Booking[] = await bookingsRes.json();
          
          const now = new Date();
          const upcoming = bookings.filter(b => 
            (b.status === "confirmed" || b.status === "pending_payment") && 
            new Date(b.scheduled_start) > now
          ).sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime());
          
          const past = bookings.filter(b => 
            b.status === "completed" || b.status === "cancelled" || b.status === "no_show" || new Date(b.scheduled_start) <= now
          ).sort((a, b) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime());

          setUpcomingBooking(upcoming.length > 0 ? upcoming[0] : null);
          setPastBookings(past);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    
    // Check if tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth() && date.getFullYear() === tomorrow.getFullYear();
    
    // Check if today
    const today = new Date();
    const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    
    let prefix = "";
    if (isToday) prefix = "Today, ";
    else if (isTomorrow) prefix = "Tomorrow, ";

    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    
    return `${prefix}${date.toLocaleDateString('en-US', options)} • ${date.toLocaleTimeString('en-US', timeOptions)}`;
  };

  const calculateStartsIn = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs <= 0) return "Started";
    
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHrs > 24) {
      const diffDays = Math.floor(diffHrs / 24);
      return `${diffDays}d ${diffHrs % 24}h`;
    }
    
    return `${diffHrs}h ${diffMins}m`;
  };

  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="font-headline-xl text-[48px] leading-[56px] font-semibold tracking-tight text-primary mb-2">
            Good morning{firstName ? `, ${firstName}` : "."}
          </h1>
          <p className="font-body-lg text-[18px] text-on-surface-variant">Here is an overview of your therapeutic journey.</p>
        </div>
        {/* Google Calendar Connect Button */}
        {calendarConnected ? (
          <button disabled className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#4FC3AA] bg-[#C3F2DA] text-[#138A72] font-label-md text-[14px] font-medium opacity-80 cursor-not-allowed shrink-0">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Connected to Google Calendar
          </button>
        ) : (
          <a href="http://localhost:8000/auth/google/client/login" className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-tertiary-container text-tertiary-container hover:bg-surface-container-highest transition-colors font-label-md text-[14px] font-medium shrink-0">
            <span className="material-symbols-outlined text-[18px]">calendar_today</span>
            Connect Google Calendar
          </a>
        )}
      </header>

      {loading ? (
        <div className="py-12 flex justify-center items-center">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <>
          {/* Upcoming Session Card */}
          <section className="mt-8">
            <h2 className="font-headline-md text-[24px] font-medium text-primary mb-6">Upcoming Session</h2>
            
            {upcomingBooking ? (
              <div className="bg-surface rounded-xl shadow-ambient p-8 flex flex-col md:flex-row gap-8 items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-full bg-surface-container flex items-center justify-center text-primary-container shadow-sm shrink-0">
                    <span className="material-symbols-outlined text-[40px]">person</span>
                  </div>
                  <div>
                    <h3 className="font-headline-lg text-[32px] font-semibold text-primary">{upcomingBooking.counselor_name}</h3>
                    <p className="font-body-md text-[16px] text-on-surface-variant flex items-center gap-2 mt-1">
                      <span className="material-symbols-outlined text-tertiary-container" style={{ fontVariationSettings: "'FILL' 1" }}>event</span>
                      {formatDateTime(upcomingBooking.scheduled_start)}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col items-center md:items-end gap-4 w-full md:w-auto">
                  <div className="bg-surface-container-low px-4 py-2 rounded-lg border border-outline-variant text-center">
                    <span className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant block uppercase mb-1">Starts in</span>
                    <span className="font-headline-md text-[24px] font-bold text-primary">{calculateStartsIn(upcomingBooking.scheduled_start)}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    {upcomingBooking.meeting_link ? (
                      <a href={upcomingBooking.meeting_link} target="_blank" rel="noopener noreferrer" className="bg-secondary text-center text-on-secondary font-label-md text-[14px] font-medium px-8 py-3 rounded-lg shadow-sm hover:bg-on-secondary-container transition-colors w-full sm:w-auto">
                        Join Session
                      </a>
                    ) : (
                      <button disabled className="bg-surface-variant text-on-surface-variant font-label-md text-[14px] font-medium px-8 py-3 rounded-lg shadow-sm w-full sm:w-auto opacity-70 cursor-not-allowed">
                        {upcomingBooking.status === "pending_payment" ? "Pending Payment" : "Link Unavailable"}
                      </button>
                    )}
                    <button className="text-tertiary-container hover:bg-surface-container-low font-label-md text-[14px] font-medium px-6 py-3 rounded-lg transition-colors border border-transparent hover:border-outline-variant w-full sm:w-auto">
                      Reschedule
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-lowest rounded-xl border border-surface-variant p-10 text-center">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant opacity-50 mb-4">calendar_add_on</span>
                <h3 className="font-headline-sm text-[20px] text-primary mb-2">No upcoming sessions</h3>
                <p className="text-on-surface-variant mb-6">Ready to continue your journey? Book a session with your counselor.</p>
                <a href="/counselors" className="inline-block bg-primary text-on-primary font-label-md px-6 py-3 rounded-lg shadow-sm hover:opacity-90 transition-opacity">
                  Find a Counselor
                </a>
              </div>
            )}
          </section>

          {/* Past Sessions */}
          <section className="mt-12">
            <div className="flex justify-between items-end mb-6">
              <h2 className="font-headline-md text-[24px] font-medium text-primary">Past Sessions</h2>
              {pastBookings.length > 3 && (
                <a href="#" className="font-label-md text-[14px] font-medium text-secondary hover:underline">View all</a>
              )}
            </div>
            
            {pastBookings.length > 0 ? (
              <div className="bg-surface rounded-xl shadow-ambient overflow-hidden">
                {pastBookings.slice(0, 3).map((booking, idx) => (
                  <div key={booking.id} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 hover:bg-surface-container-low transition-colors gap-4 ${idx !== pastBookings.slice(0,3).length - 1 ? 'border-b border-surface-variant' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="bg-surface-container w-12 h-12 rounded-full flex items-center justify-center text-primary-container shrink-0">
                        <span className="material-symbols-outlined">person</span>
                      </div>
                      <div>
                        <p className="font-label-md text-[14px] font-bold text-primary">{booking.counselor_name}</p>
                        <p className="font-label-sm text-[12px] text-on-surface-variant">{formatDate(booking.scheduled_start)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                      {booking.status === "completed" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-[12px] font-semibold">
                          <span className="material-symbols-outlined text-[16px]">check_circle</span> Completed
                        </span>
                      )}
                      {booking.status === "cancelled" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-variant text-on-surface-variant font-label-sm text-[12px] font-semibold">
                          <span className="material-symbols-outlined text-[16px]">cancel</span> Cancelled
                        </span>
                      )}
                      {(booking.status === "pending_payment" || booking.status === "confirmed") && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary-container text-on-tertiary-container font-label-sm text-[12px] font-semibold">
                          <span className="material-symbols-outlined text-[16px]">schedule</span> Past
                        </span>
                      )}
                      <button className={`font-label-md text-[14px] font-medium text-tertiary-container hover:underline flex items-center gap-1 ${booking.status === 'cancelled' ? 'invisible' : ''}`}>
                        Receipt <span className="material-symbols-outlined text-[16px]">download</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface-container-lowest rounded-xl border border-surface-variant p-8 text-center text-on-surface-variant">
                You don't have any past sessions yet.
              </div>
            )}
          </section>
        </>
      )}
    </DashboardLayout>
  );
}
