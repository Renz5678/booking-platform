"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import type { CounselorProfile } from "@/types";

interface AnalyticsResponse {
  total_bookings?: number;
  total_revenue?: number;
  bookings_by_status?: Record<string, number>;
  bookings_by_counselor?: Array<{
    counselor_id: string;
    counselor_name?: string;
    count: number;
    revenue?: number;
  }>;
}

export default function AdminAnalyticsPage() {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [counselorNames, setCounselorNames] = useState<Record<string, string>>(
    {}
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadAnalytics = async () => {
      try {
        const [stats, pending, activeCounselors] = await Promise.all([
          api.get<AnalyticsResponse>("/admin/analytics"),
          api.get<CounselorProfile[]>("/admin/counselors/pending"),
          api.get<CounselorProfile[]>("/admin/counselors?status=active"),
        ]);

        if (!active) return;
        setAnalytics(stats);
        setPendingCount(Array.isArray(pending) ? pending.length : 0);

        const map: Record<string, string> = {};
        if (Array.isArray(activeCounselors)) {
          activeCounselors.forEach((c) => {
            if (c.user?.full_name) map[c.id] = c.user.full_name;
          });
        }
        if (Array.isArray(pending)) {
          pending.forEach((c) => {
            if (c.user?.full_name) map[c.id] = c.user.full_name;
          });
        }
        setCounselorNames(map);
      } catch {
        if (active) toast.error("Unable to load analytics.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadAnalytics();
    return () => {
      active = false;
    };
  }, [toast]);

  const statusChartData = useMemo(() => {
    const byStatus = analytics?.bookings_by_status || {};
    return Object.entries(byStatus).map(([status, count]) => ({
      status: status.replace("_", " "),
      count,
    }));
  }, [analytics]);

  const counselorChartData = useMemo(() => {
    return (analytics?.bookings_by_counselor || []).map((item) => ({
      name:
        item.counselor_name ||
        counselorNames[item.counselor_id] ||
        `Counselor ${item.counselor_id.slice(0, 6)}`,
      bookings: item.count,
    }));
  }, [analytics, counselorNames]);

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <DashboardLayout role="admin">
        <div className="space-y-8">
          <div>
            <h1 className="font-serif text-headline-lg text-text-primary">
              Platform Analytics
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Booking volume, status distribution, and practitioner workload.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Total Bookings
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-text-primary tabular-nums">
                {loading ? "—" : analytics?.total_bookings ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Total Revenue
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-primary tabular-nums">
                {loading
                  ? "—"
                  : `₱${Number(analytics?.total_revenue ?? 0).toLocaleString()}`}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5 shadow-ambient">
              <p className="text-xs font-medium text-text-muted">
                Pending Verifications
              </p>
              <p className="mt-2 font-serif text-3xl font-medium text-status-warning tabular-nums">
                {loading ? "—" : pendingCount}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
              <h2 className="font-serif text-lg font-medium text-text-primary">
                Bookings by Status
              </h2>
              <div className="mt-4 h-64">
                {loading ? (
                  <div className="h-full animate-pulse rounded-xl bg-surface-muted" />
                ) : statusChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-text-muted">
                    No status data available yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E1D8" />
                      <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="#1E5E4A"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
              <h2 className="font-serif text-lg font-medium text-text-primary">
                Bookings by Counselor
              </h2>
              <div className="mt-4 h-64">
                {loading ? (
                  <div className="h-full animate-pulse rounded-xl bg-surface-muted" />
                ) : counselorChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-text-muted">
                    No counselor booking data yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={counselorChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E1D8" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar
                        dataKey="bookings"
                        fill="#142534"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
