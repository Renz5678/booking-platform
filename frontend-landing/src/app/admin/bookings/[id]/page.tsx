"use client";

import { useEffect, useState, use } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BookingRecord } from "@/lib/contracts";

export default function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const data = await api.get(`/bookings/${resolvedParams.id}`);
        setBooking(data);
      } catch (err) {
        console.error(err);
        setToastMessage("Failed to load booking details.");
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
      {toastMessage && (
        <div role="status" className="bg-secondary text-on-secondary px-4 py-2 rounded-lg shadow-lg font-label-md mb-4 inline-block">
          {toastMessage}
        </div>
      )}
      <Link href="/admin/bookings" className="flex items-center gap-2 text-primary hover:underline mb-6 font-label-lg">
        <span className="material-symbols-outlined">arrow_back</span> Back to Bookings
      </Link>
      
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-headline-xl text-primary">Booking Details</h1>
          <p className="font-body-lg text-on-surface-variant">ID: {booking.id}</p>
        </div>
        <div className="bg-surface-container px-4 py-2 rounded-lg text-on-surface font-label-md uppercase tracking-wider font-bold">
          {booking.status.replace("_", " ")}
        </div>
      </div>

      {booking.status === "pending_payment" && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-secondary-container mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="font-headline-md text-primary mb-1">GCash Payment Verification</h2>
            <p className="font-body-sm text-on-surface-variant">
              The booking is currently pending payment. As an administrator, you can confirm receipt of GCash transfer.
            </p>
          </div>
          <Link href="/admin/payments" className="border rounded p-3">Open payment review queue</Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <h2 className="font-headline-md text-primary mb-4 border-b pb-2">Session Info</h2>
          <div className="space-y-3 font-body-md">
            <p><strong className="text-on-surface-variant">Client:</strong> {booking.client_name}</p>
            <p><strong className="text-on-surface-variant">Counselor:</strong> {booking.counselor_name}</p>
            <p><strong className="text-on-surface-variant">Start:</strong> {new Date(booking.scheduled_start).toLocaleString()}</p>
            <p><strong className="text-on-surface-variant">End:</strong> {new Date(booking.scheduled_end).toLocaleString()}</p>
            {booking.meeting_link && (
              <p>
                <strong className="text-on-surface-variant">Meeting Link:</strong>{" "}
                <a href={booking.meeting_link} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {booking.meeting_link}
                </a>
              </p>
            )}
          </div>
        </div>


        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest md:col-span-2">
          <h2 className="font-headline-md text-primary mb-4 border-b pb-2">Payment Info</h2>
          {booking.payment ? (
            <div className="space-y-3 font-body-md grid grid-cols-2">
              <p><strong className="text-on-surface-variant">Amount:</strong> ₱{Number(booking.payment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              <p><strong className="text-on-surface-variant">Method:</strong> {booking.payment.payment_method || booking.payment.provider || "GCash Manual"}</p>
              <p><strong className="text-on-surface-variant">Reference:</strong> {booking.payment.transaction_reference || "None"}</p>
              <p><strong className="text-on-surface-variant">Refund Reference:</strong> {booking.payment.refund_reference || "N/A"}</p>
            </div>
          ) : (
            <p className="text-on-surface-variant italic">No payment record found.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
