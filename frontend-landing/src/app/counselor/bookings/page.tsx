"use client";

import { useEffect, useState } from "react";
import { Booking } from "@/types";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function CounselorBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await fetch("http://localhost:8000/bookings/counselor/me", {
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          setBookings(data);
        }
      } catch (err) {
        console.error("Failed to fetch bookings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, []);

  return (
    <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
      <div className="max-w-5xl mx-auto">
        <h1 className="font-headline-xl text-primary mb-2">My Bookings</h1>
        <p className="font-body-lg text-on-surface-variant mb-8">Manage your upcoming sessions and review past appointments.</p>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex justify-between items-center shadow-sm">
                <div className="space-y-2 flex-1">
                  <div className="h-6 w-1/3 bg-surface-variant/30 rounded animate-pulse"></div>
                  <div className="h-4 w-1/4 bg-surface-variant/20 rounded animate-pulse"></div>
                  <div className="h-4 w-1/5 bg-surface-variant/20 rounded animate-pulse"></div>
                </div>
                <div className="h-10 w-32 bg-surface-variant/30 rounded-lg animate-pulse"></div>
              </div>
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-surface-container-low p-8 rounded-xl text-center text-on-surface-variant">
            You don't have any bookings yet.
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking, idx) => (
              <div key={idx} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex justify-between items-center shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                <div>
                  <p className="font-headline-md text-primary font-bold">Booking #{booking.id.substring(0, 8)}</p>
                  <p className="font-label-md text-on-surface-variant mt-1">Status: <span className="uppercase text-secondary font-bold">{booking.status}</span></p>
                  <p className="font-label-sm text-on-surface-variant mt-1">{new Date(booking.scheduled_start).toLocaleString()}</p>
                </div>
                <button className="bg-secondary text-on-secondary px-4 py-2 rounded-lg font-label-md hover:opacity-90 active:scale-[0.98] transition-all duration-200">View Details</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
