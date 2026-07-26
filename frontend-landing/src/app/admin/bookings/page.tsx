"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function AdminBookingsPage() {
  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <h1 className="font-headline-xl text-primary mb-2">Platform Bookings</h1>
      <p className="font-body-lg text-on-surface-variant mb-8">Overview of all sessions happening across the platform.</p>
      
      <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant">
        <p className="text-on-surface-variant text-center">Placeholder for platform booking ledger.</p>
      </div>
    </DashboardLayout>
  );
}
