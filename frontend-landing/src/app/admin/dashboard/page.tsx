"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";

interface PendingCounselor {
  id: string;
  user: {
    full_name: string;
    email: string;
  };
  bio?: string;
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [totalBookings, setTotalBookings] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState("0");
  const [todaysBookings, setTodaysBookings] = useState(0);
  const [pendingCounselors, setPendingCounselors] = useState<PendingCounselor[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch Analytics
      const analyticsData = await api.get("/admin/analytics");
      setTotalBookings(analyticsData.total_bookings);
      if (analyticsData.total_revenue >= 1000) {
        setTotalRevenue((analyticsData.total_revenue / 1000).toFixed(1) + "k");
      } else {
        setTotalRevenue(analyticsData.total_revenue.toString());
      }

      // Fetch Pending Counselors
      const pendingData = await api.get("/admin/counselors/pending");
      setPendingCounselors(pendingData);

      // Fetch Bookings to calculate "Bookings Today"
      const bookingsData = await api.get("/admin/bookings");
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      
      const todayBookings = bookingsData.filter((b: any) => {
        const d = new Date(b.scheduled_start);
        return d >= startOfDay && d <= endOfDay;
      });
      setTodaysBookings(todayBookings.length);
    } catch (error) {
      console.error("Error fetching admin data:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleApprove = async (counselorId: string) => {
    setVerifyingId(counselorId);
    try {
      await api.post(`/admin/counselors/${counselorId}/verify`, {});
      // Remove from list
      setPendingCounselors(prev => prev.filter(c => c.id !== counselorId));
    } catch (error) {
      console.error("Error verifying counselor:", error);
      alert("Failed to verify counselor");
    } finally {
      setVerifyingId(null);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
  };

  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      {loading ? (
        <div className="py-12 flex justify-center items-center">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : (
        <>
          {/* Header */}
          <header className="mb-6 flex justify-between items-end">
            <div>
              <h2 className="font-headline-lg text-[32px] font-semibold tracking-tight text-primary mb-2">Welcome back, Admin</h2>
              <p className="font-body-md text-[16px] text-on-surface-variant">Here's what's happening on the platform today.</p>
            </div>
          </header>

          {/* Stat Cards Row */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {/* Card 1 */}
            <div className="bg-white rounded-xl p-6 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all border border-surface-container-highest">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-label-md text-[14px] font-medium text-on-surface-variant">Counselors Pending Review</h3>
                <div className="bg-secondary-container text-on-secondary-container p-2 rounded-lg">
                  <span className="material-symbols-outlined">pending_actions</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-[48px] font-semibold tracking-tight text-primary">{pendingCounselors.length}</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-xl p-6 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all border border-surface-container-highest">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-label-md text-[14px] font-medium text-on-surface-variant">Total Platform Bookings</h3>
                <div className="bg-tertiary-fixed text-on-tertiary-fixed p-2 rounded-lg">
                  <span className="material-symbols-outlined">calendar_month</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-[48px] font-semibold tracking-tight text-primary">{totalBookings}</span>
                <span className="font-label-sm text-[12px] font-semibold tracking-wider text-secondary flex items-center">
                  <span className="material-symbols-outlined text-[16px]">today</span> {todaysBookings} Today
                </span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-xl p-6 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all border border-surface-container-highest">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-label-md text-[14px] font-medium text-on-surface-variant">Total Platform Revenue</h3>
                <div className="bg-primary-fixed text-on-primary-fixed p-2 rounded-lg">
                  <span className="material-symbols-outlined">payments</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-[48px] font-semibold tracking-tight text-primary">₱{totalRevenue}</span>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white rounded-xl p-6 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all border border-error-container">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-label-md text-[14px] font-medium text-on-surface-variant">Flagged Issues</h3>
                <div className="bg-error-container text-on-error-container p-2 rounded-lg">
                  <span className="material-symbols-outlined">flag</span>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-[48px] font-semibold tracking-tight text-error">0</span>
                <span className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">All clear</span>
              </div>
            </div>
          </section>

          {/* Main Content Area: Needs Attention Grid */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Counselors Needs Review */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-surface-container-highest flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline-md text-[24px] font-medium text-primary">Pending Counselors</h3>
              </div>
              <div className="flex flex-col gap-4 flex-1">
                {pendingCounselors.length > 0 ? (
                  pendingCounselors.map((counselor, idx) => {
                    const colors = [
                      "bg-primary-fixed text-on-primary-fixed",
                      "bg-tertiary-fixed text-on-tertiary-fixed",
                      "bg-primary-fixed-dim text-on-primary-fixed"
                    ];
                    const colorClass = colors[idx % colors.length];

                    return (
                      <div key={counselor.id} className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border border-surface-container-highest hover:bg-surface-container-low transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${colorClass}`}>
                            {getInitials(counselor.user?.full_name)}
                          </div>
                          <div>
                            <h4 className="font-label-md text-[14px] font-bold text-primary">{counselor.user?.full_name}</h4>
                            <p className="font-label-sm text-[12px] font-semibold tracking-wider text-on-surface-variant">
                              {counselor.user?.email}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleApprove(counselor.id)}
                          disabled={verifyingId === counselor.id}
                          className="bg-primary text-on-primary px-3 py-1.5 rounded-lg font-label-sm text-[12px] font-semibold tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {verifyingId === counselor.id ? 'Approving...' : 'Approve'}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[48px] opacity-50 mb-2">check_circle</span>
                    <p>All counselor profiles have been reviewed.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Reported Bookings / Issues */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-surface-container-highest flex flex-col h-full opacity-50">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline-md text-[24px] font-medium text-primary flex items-center gap-2">
                  Flagged Issues <span className="bg-surface-container-high text-on-surface-variant font-label-sm text-[12px] font-semibold tracking-wider px-2 py-0.5 rounded-full">0</span>
                </h3>
              </div>
              <div className="flex flex-col gap-4 flex-1">
                <div className="text-center py-8 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[48px] opacity-50 mb-2">done_all</span>
                  <p>No flagged issues requiring attention.</p>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </DashboardLayout>
  );
}
