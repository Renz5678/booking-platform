"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function AdminAnalyticsPage() {
  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <h1 className="font-headline-xl text-primary mb-2">System Analytics</h1>
      <p className="font-body-lg text-on-surface-variant mb-8">Key metrics and health of the Alaga platform.</p>
      
      <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant">
        <p className="text-on-surface-variant text-center">Placeholder for analytics charts and KPI reports.</p>
      </div>
    </DashboardLayout>
  );
}
