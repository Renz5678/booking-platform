"use client";

import { useEffect, useState, use } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api, ApiError } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Booking } from "@/types";
import RescheduleModal from "@/components/dashboard/RescheduleModal";

export default function ClientBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);

  useEffect(() => {
    fetchBooking();
  }, [resolvedParams.id]);

  const fetchBooking = async () => {
    try {
      const data = await api.get(`/bookings/${resolvedParams.id}`);
      setBooking(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await api.post(`/bookings/${booking.id}/cancel`, {});
      alert("Booking cancelled.");
      fetchBooking();
    } catch (err: unknown) {
      alert(`Failed to cancel booking: ${err instanceof ApiError ? err.message : (err as Error).message}`);
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="client" allowedRoles={["client"]}>
        <div className="animate-pulse space-y-4 max-w-3xl mx-auto">
          <div className="h-8 bg-surface-variant w-1/3 rounded"></div>
          <div className="h-48 bg-surface-variant rounded-xl"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!booking) {
    return (
      <DashboardLayout role="client" allowedRoles={["client"]}>
        <div className="text-center p-8">
          <p className="text-error">Booking not found.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-primary hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const now = new Date();
  const sessionStart = new Date(booking.scheduled_start);
  const sessionEnd = new Date(booking.scheduled_end);
  const hasStarted = sessionStart <= now;
  const isConfirmed = booking.status === "confirmed";

  // Build Google Calendar Add Link
  const gcalFormat = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const text = encodeURIComponent(`Counseling Session with ${booking.counselor?.user?.full_name || booking.counselor_name}`);
  const dates = `${gcalFormat(sessionStart)}/${gcalFormat(sessionEnd)}`;
  const details = encodeURIComponent(booking.google_meet_link ? `Join here: ${booking.google_meet_link}` : "Details pending.");
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`;

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="flex items-center gap-2 text-primary hover:underline mb-6 font-label-lg">
          <span className="material-symbols-outlined">arrow_back</span> Back to Dashboard
        </Link>
        
        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h1 className="font-headline-xl text-primary">Booking Session</h1>
            <p className="font-body-lg text-on-surface-variant">with {booking.counselor?.user?.full_name || booking.counselor_name}</p>
          </div>
          <div className="bg-surface-container px-4 py-2 rounded-lg text-on-surface font-label-md uppercase tracking-wider font-bold">
            {booking.status.replace("_", " ")}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
            <h2 className="font-headline-md text-primary mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">calendar_today</span>
              Schedule
            </h2>
            <div className="space-y-3 font-body-md mb-6">
              <p><strong className="text-on-surface-variant w-24 inline-block">Start:</strong> {sessionStart.toLocaleString()}</p>
              <p><strong className="text-on-surface-variant w-24 inline-block">End:</strong> {sessionEnd.toLocaleString()}</p>
            </div>
            
            <div className="space-y-3">
              {booking.google_meet_link && (
                <a 
                  href={booking.google_meet_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full bg-primary text-on-primary px-4 py-3 rounded-lg font-label-lg hover:bg-primary/90 transition-colors"
                >
                  <span className="material-symbols-outlined">videocam</span>
                  Join Google Meet
                </a>
              )}
              
              <div className="flex gap-2">
                <a 
                  href={`${API_URL}/bookings/${booking.id}/ics`}
                  className="flex-1 bg-surface-container-high text-on-surface text-center px-4 py-2 rounded-lg font-label-md hover:bg-surface-container-highest transition-colors"
                >
                  Download .ics
                </a>
                <a 
                  href={gcalUrl}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 bg-surface-container-high text-on-surface text-center px-4 py-2 rounded-lg font-label-md hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-[18px]">calendar_add_on</span> Add to GCal
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest flex flex-col justify-between">
            <div>
              <h2 className="font-headline-md text-primary mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">description</span>
                Intake Summary
              </h2>
              <div className="space-y-4 font-body-md">
                <div>
                  <strong className="text-on-surface-variant block mb-1">Concern Category:</strong> 
                  <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm inline-block">
                    {booking.intake_form?.concern_category || "Not specified"}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <a 
                href={`${API_URL}/bookings/${booking.id}/receipt`}
                className="inline-flex items-center gap-2 text-tertiary hover:underline font-label-md"
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span> Download Receipt
              </a>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {isConfirmed && !hasStarted && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
            <h2 className="font-headline-md text-primary mb-4">Session Actions</h2>
            <div className="flex gap-4">
              <button 
                onClick={() => setReschedulingBooking(booking)}
                className="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label-md hover:opacity-90"
              >
                Reschedule
              </button>
              <button 
                onClick={handleCancel}
                className="bg-error-container text-on-error-container px-6 py-2 rounded-lg font-label-md hover:opacity-90"
              >
                Cancel Session
              </button>
            </div>
          </div>
        )}
      </div>
      
      {reschedulingBooking && (
        <RescheduleModal
          booking={reschedulingBooking}
          onClose={() => setReschedulingBooking(null)}
          onSuccess={() => {
            setReschedulingBooking(null);
            fetchBooking();
          }}
        />
      )}
    </DashboardLayout>
  );
}
