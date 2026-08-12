"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface AnalyticsData {
  total_bookings: number;
  total_revenue: number;
  status_breakdown: Record<string, number>;
  completion_rate_percent: number;
  per_counselor_stats: {
    counselor_id: string;
    total_sessions: number;
    total_revenue: number;
  }[];
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [analyticsRes, pendingRes] = await Promise.all([
          api.get("/admin/analytics"),
          api.get("/admin/counselors/pending")
        ]);
        setData(analyticsRes);
        setPendingCount(pendingRes?.length || 0);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <DashboardLayout role="admin" allowedRoles={["admin"]}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-surface-variant rounded-xl"></div>
          ))}
        </div>
        <div className="h-96 bg-surface-variant rounded-xl animate-pulse"></div>
      </DashboardLayout>
    );
  }

  const formatCurrency = (amount: number) => {
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const chartData = data ? Object.entries(data.status_breakdown).map(([status, count]) => ({
    status: status.replace("_", " ").toUpperCase(),
    count
  })) : [];

  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <h1 className="font-headline-xl text-primary mb-2">Platform Analytics</h1>
      <p className="font-body-lg text-on-surface-variant mb-8">Performance and financial overview of the platform.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <h3 className="font-label-md text-on-surface-variant mb-2">Total Bookings</h3>
          <p className="font-headline-xl text-primary">{data?.total_bookings || 0}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <h3 className="font-label-md text-on-surface-variant mb-2">Total Revenue</h3>
          <p className="font-headline-xl text-primary">{formatCurrency(data?.total_revenue || 0)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <h3 className="font-label-md text-on-surface-variant mb-2">Completion Rate</h3>
          <p className="font-headline-xl text-primary">{data?.completion_rate_percent || 0}%</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-error-container">
          <h3 className="font-label-md text-on-surface-variant mb-2">Pending Counselors</h3>
          <p className="font-headline-xl text-error">{pendingCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <h2 className="font-headline-md text-primary mb-6">Booking Status Breakdown</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="status" tick={{ fill: 'var(--color-on-surface-variant)' }} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-on-surface-variant)' }} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'var(--color-surface-container)' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest overflow-hidden">
          <h2 className="font-headline-md text-primary mb-6">Counselor Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-md">
              <thead className="bg-surface-container-lowest border-b border-surface-container-highest">
                <tr>
                  <th className="p-3 font-label-md text-on-surface-variant">Counselor ID</th>
                  <th className="p-3 font-label-md text-on-surface-variant text-right">Sessions</th>
                  <th className="p-3 font-label-md text-on-surface-variant text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data?.per_counselor_stats?.map((stat, idx) => (
                  <tr key={idx} className="border-b border-surface-container-highest hover:bg-surface-container-lowest">
                    <td className="p-3 truncate max-w-[150px]" title={stat.counselor_id}>{stat.counselor_id.substring(0,8)}...</td>
                    <td className="p-3 text-right">{stat.total_sessions}</td>
                    <td className="p-3 text-right">{formatCurrency(stat.total_revenue)}</td>
                  </tr>
                ))}
                {(!data?.per_counselor_stats || data.per_counselor_stats.length === 0) && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-on-surface-variant">No data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
