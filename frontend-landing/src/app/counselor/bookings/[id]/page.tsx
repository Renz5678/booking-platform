"use client";

import { useEffect, useState, use } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CounselorBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleUpdateStatus = async (status: string) => {
    setActionLoading(status);
    try {
      await api.put(`/bookings/${booking.id}/status`, { status });
      showToast(`Marked as ${status}`);
      fetchBooking();
    } catch (err) {
      console.error(err);
      alert("Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    setActionLoading("cancel");
    try {
      await api.post(`/bookings/${booking.id}/counselor-cancel`, {});
      showToast("Booking cancelled");
      fetchBooking();
    } catch (err) {
      console.error(err);
      alert("Failed to cancel booking");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
        <div className="animate-pulse space-y-4 max-w-3xl mx-auto">
          <div className="h-8 bg-surface-variant w-1/3 rounded"></div>
          <div className="h-48 bg-surface-variant rounded-xl"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!booking) {
    return (
      <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
        <div className="text-center p-8">
          <p className="text-error">Booking not found.</p>
          <Link href="/counselor/bookings" className="mt-4 inline-block text-primary hover:underline">
            Back to Bookings
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const now = new Date();
  const sessionEnd = new Date(booking.scheduled_end);
  const hasEnded = sessionEnd < now;

  return (
    <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
      <div className="max-w-4xl mx-auto relative">
        {toastMessage && (
          <div className="absolute top-0 right-0 bg-secondary text-on-secondary px-4 py-2 rounded-lg shadow-lg font-label-md transition-opacity">
            {toastMessage}
          </div>
        )}
        
        <Link href="/counselor/bookings" className="flex items-center gap-2 text-primary hover:underline mb-6 font-label-lg">
          <span className="material-symbols-outlined">arrow_back</span> Back to My Bookings
        </Link>
        
        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h1 className="font-headline-xl text-primary">Booking Session</h1>
            <p className="font-body-lg text-on-surface-variant">with {booking.client?.full_name}</p>
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
            <div className="space-y-3 font-body-md">
              <p><strong className="text-on-surface-variant w-24 inline-block">Start:</strong> {new Date(booking.scheduled_start).toLocaleString()}</p>
              <p><strong className="text-on-surface-variant w-24 inline-block">End:</strong> {sessionEnd.toLocaleString()}</p>
            </div>
            
            {booking.google_meet_link && (
              <div className="mt-6">
                <a 
                  href={booking.google_meet_link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full bg-primary text-on-primary px-4 py-3 rounded-lg font-label-lg hover:bg-primary/90 transition-colors"
                >
                  <span className="material-symbols-outlined">videocam</span>
                  Join Google Meet
                </a>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
            <h2 className="font-headline-md text-primary mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">description</span>
              Intake Information
            </h2>
            <div className="space-y-4 font-body-md">
              <div>
                <strong className="text-on-surface-variant block mb-1">Concern Category:</strong> 
                <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm inline-block">
                  {booking.intake_form?.concern_category || "Not specified"}
                </span>
              </div>
              <div>
                <strong className="text-on-surface-variant block mb-1">Notes from Client:</strong>
                <p className="bg-surface-container-lowest p-3 rounded-lg border border-surface-variant min-h-[80px] whitespace-pre-wrap">
                  {booking.intake_form?.notes || "No additional notes provided."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {booking.status === "confirmed" && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
            <h2 className="font-headline-md text-primary mb-4">Session Actions</h2>
            <div className="flex gap-4 flex-wrap">
              {hasEnded ? (
                <>
                  <button 
                    onClick={() => handleUpdateStatus("completed")}
                    disabled={!!actionLoading}
                    className="flex-1 bg-tertiary-fixed text-on-tertiary-fixed px-4 py-3 rounded-lg font-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined">check_circle</span>
                    {actionLoading === "completed" ? "Marking..." : "Mark as Completed"}
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus("no_show")}
                    disabled={!!actionLoading}
                    className="flex-1 bg-surface-container-high text-on-surface px-4 py-3 rounded-lg font-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined">person_off</span>
                    {actionLoading === "no_show" ? "Marking..." : "Mark as No-Show"}
                  </button>
                </>
              ) : (
                <button 
                  onClick={handleCancel}
                  disabled={!!actionLoading}
                  className="bg-error-container text-on-error-container px-4 py-3 rounded-lg font-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">cancel</span>
                  {actionLoading === "cancel" ? "Cancelling..." : "Cancel Session"}
                </button>
              )}
            </div>
            {!hasEnded && (
              <p className="text-on-surface-variant font-body-sm mt-4">
                Note: "Mark as Completed" and "Mark as No-Show" will be available after the session scheduled end time.
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
