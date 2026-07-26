"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function AdminContentPage() {
  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <h1 className="font-headline-xl text-primary mb-2">Content Management</h1>
      <p className="font-body-lg text-on-surface-variant mb-8">Manage FAQ entries and platform copy.</p>
      
      <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant">
        <p className="text-on-surface-variant text-center">Placeholder for CMS tools.</p>
      </div>
    </DashboardLayout>
  );
}
