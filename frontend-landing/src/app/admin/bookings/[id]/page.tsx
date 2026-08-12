"use client";

import { useEffect, useState, use } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchBooking();
  }, [resolvedParams.id]);

  if (loading) {
    return (
      <DashboardLayout role="admin" allowedRoles={["admin"]}>
        <div className="animate-pulse space-y-4 max-w-3xl">
          <div className="h-8 bg-surface-variant w-1/3 rounded"></div>
          <div className="h-48 bg-surface-variant rounded-xl"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!booking) {
    return (
      <DashboardLayout role="admin" allowedRoles={["admin"]}>
        <div className="text-center p-8">
          <p className="text-error">Booking not found.</p>
          <button onClick={() => router.push('/admin/bookings')} className="mt-4 text-primary hover:underline">
            Back to Bookings
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <Link href="/admin/bookings" className="flex items-center gap-2 text-primary hover:underline mb-6 font-label-lg">
        <span className="material-symbols-outlined">arrow_back</span> Back to Bookings
      </Link>
      
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-headline-xl text-primary">Booking Details</h1>
          <p className="font-body-lg text-on-surface-variant">ID: {booking.id}</p>
        </div>
        <div className="bg-surface-container px-4 py-2 rounded-lg text-on-surface font-label-md uppercase tracking-wider">
          {booking.status.replace("_", " ")}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <h2 className="font-headline-md text-primary mb-4 border-b pb-2">Session Info</h2>
          <div className="space-y-3 font-body-md">
            <p><strong className="text-on-surface-variant">Client:</strong> {booking.client?.full_name}</p>
            <p><strong className="text-on-surface-variant">Counselor:</strong> {booking.counselor?.user?.full_name}</p>
            <p><strong className="text-on-surface-variant">Start:</strong> {new Date(booking.scheduled_start).toLocaleString()}</p>
            <p><strong className="text-on-surface-variant">End:</strong> {new Date(booking.scheduled_end).toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <h2 className="font-headline-md text-primary mb-4 border-b pb-2">Intake Form</h2>
          <div className="space-y-3 font-body-md">
            <p><strong className="text-on-surface-variant">Concern Category:</strong> {booking.intake_form?.concern_category || "N/A"}</p>
            <p><strong className="text-on-surface-variant">Notes:</strong> {booking.intake_form?.notes || "N/A"}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest md:col-span-2">
          <h2 className="font-headline-md text-primary mb-4 border-b pb-2">Payment Info</h2>
          {booking.payment ? (
            <div className="space-y-3 font-body-md grid grid-cols-2">
              <p><strong className="text-on-surface-variant">Amount:</strong> ₱{booking.payment.amount}</p>
              <p><strong className="text-on-surface-variant">Status:</strong> {booking.payment.status}</p>
              <p><strong className="text-on-surface-variant">Method:</strong> {booking.payment.payment_method}</p>
              <p><strong className="text-on-surface-variant">Refund Status:</strong> {booking.payment.refund_status || "N/A"}</p>
            </div>
          ) : (
            <p className="text-on-surface-variant italic">No payment record found.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
