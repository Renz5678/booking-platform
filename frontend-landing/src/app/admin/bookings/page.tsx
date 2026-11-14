"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import type { Booking } from "@/types";

function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminBookingsPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    const loadBookings = async () => {
      setLoading(true);
      try {
        const url =
          statusFilter === "all"
            ? "/admin/bookings"
            : `/admin/bookings?status=${statusFilter}`;
        const data = await api.get<Booking[]>(url);
        if (active && Array.isArray(data)) {
          setBookings(data);
        }
      } catch {
        if (active) toast.error("Unable to load bookings.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadBookings();
    return () => {
      active = false;
    };
  }, [statusFilter, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const client = (b.client_name || b.client?.full_name || "").toLowerCase();
      const counselor = (
        b.counselor_name ||
        b.counselor?.user?.full_name ||
        ""
      ).toLowerCase();
      return (
        client.includes(q) ||
        counselor.includes(q) ||
        b.id.toLowerCase().includes(q)
      );
    });
  }, [bookings, search]);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DashboardLayout role="admin">
        <div className="space-y-6">
          <div>
            <h1 className="font-serif text-headline-lg text-text-primary">
              All Bookings
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Search and inspect platform bookings across all clients and
              counselors.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <label htmlFor="admin-booking-search" className="sr-only">
                Search bookings
              </label>
              <span
                aria-hidden="true"
                className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted"
              >
                search
              </span>
              <input
                id="admin-booking-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search client, counselor, or ID…"
                className="w-full rounded-xl border border-border-subtle bg-surface-elevated py-2 pl-9 pr-4 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            <select
              aria-label="Filter by booking status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-border-subtle bg-surface-elevated px-3.5 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface-elevated shadow-ambient">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-muted/60 text-xs font-semibold uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Counselor</th>
                  <th className="px-5 py-3">Date &amp; Time (PHT)</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-sm text-text-muted"
                    >
                      Loading bookings…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center text-sm text-text-muted"
                    >
                      No bookings found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((b) => (
                    <tr key={b.id} className="hover:bg-background/60">
                      <td className="px-5 py-3 font-medium text-text-primary">
                        {b.client_name || b.client?.full_name || "Client"}
                      </td>
                      <td className="px-5 py-3 text-text-secondary">
                        {b.counselor_name ||
                          b.counselor?.user?.full_name ||
                          "Counselor"}
                      </td>
                      <td className="px-5 py-3 text-xs text-text-secondary tabular-nums">
                        {formatManilaDateTime(b.scheduled_start)}
                      </td>
                      <td className="px-5 py-3 capitalize text-xs font-semibold text-text-secondary">
                        {b.status.replace("_", " ")}
                      </td>
                      <td className="px-5 py-3 font-medium text-text-primary tabular-nums">
                        {b.payment?.amount != null
                          ? `₱${Number(b.payment.amount).toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/bookings/${b.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Inspect
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
