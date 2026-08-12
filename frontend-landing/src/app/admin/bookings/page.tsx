"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import Link from "next/link";

interface UserInfo {
  id: string;
  email: string;
  full_name: string;
}

interface Booking {
  id: string;
  client_id: string;
  counselor_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  client: UserInfo;
  counselor: { user: UserInfo };
  payment_status?: string; // Note: We might need to check if payment comes with booking in the list
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");

  useEffect(() => {
    fetchBookings();
  }, [statusFilter]);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const url = `/admin/bookings${statusFilter ? `?status=${statusFilter}` : ""}`;
      const data = await api.get(url);
      setBookings(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-primary text-on-primary";
      case "pending_payment": return "bg-secondary-container text-on-secondary-container";
      case "completed": return "bg-tertiary-fixed text-on-tertiary-fixed";
      case "cancelled": return "bg-error-container text-on-error-container";
      case "no_show": return "bg-surface-container-high text-on-surface";
      default: return "bg-surface-container text-on-surface";
    }
  };

  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <h1 className="font-headline-xl text-primary mb-2">Platform Bookings</h1>
      <p className="font-body-lg text-on-surface-variant mb-8">Overview of all sessions happening across the platform.</p>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest mb-6 flex gap-4">
        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-surface-container-highest rounded-lg px-4 py-2 font-body-md text-on-surface"
        >
          <option value="">All Statuses</option>
          <option value="pending_payment">Pending Payment</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-surface-container-highest overflow-hidden">
        {loading ? (
          <div className="flex flex-col">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex p-4 border-b border-surface-container-highest animate-pulse gap-4">
                <div className="h-4 bg-surface-variant w-1/4 rounded"></div>
                <div className="h-4 bg-surface-variant w-1/4 rounded"></div>
                <div className="h-4 bg-surface-variant w-1/4 rounded"></div>
                <div className="h-4 bg-surface-variant w-1/4 rounded"></div>
              </div>
            ))}
          </div>
        ) : bookings.length > 0 ? (
          <table className="w-full text-left font-body-md">
            <thead className="bg-surface-container-lowest border-b border-surface-container-highest">
              <tr>
                <th className="p-4 font-label-md text-on-surface-variant">Client</th>
                <th className="p-4 font-label-md text-on-surface-variant">Counselor</th>
                <th className="p-4 font-label-md text-on-surface-variant">Date / Time</th>
                <th className="p-4 font-label-md text-on-surface-variant">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-surface-container-highest hover:bg-surface-container-lowest transition-colors">
                  <td className="p-4">
                    <Link href={`/admin/bookings/${booking.id}`} className="hover:underline text-primary">
                      {booking.client?.full_name || "Unknown"}
                    </Link>
                  </td>
                  <td className="p-4">{booking.counselor?.user?.full_name || "Unknown"}</td>
                  <td className="p-4">
                    {new Date(booking.scheduled_start).toLocaleString()}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full font-label-sm ${getStatusColor(booking.status)}`}>
                      {booking.status.replace("_", " ").toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-on-surface-variant">
            <p>No bookings found.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
