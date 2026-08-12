"use client";

import { useEffect, useState, use } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminCounselorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [counselor, setCounselor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchCounselor();
  }, [resolvedParams.id]);

  const fetchCounselor = async () => {
    try {
      // The public endpoint gets profile data, wait we need admin access if not verified.
      // Assuming GET /counselors/{id} allows admin to view it regardless of verification status.
      // If it fails we catch it.
      const data = await api.get(`/counselors/${resolvedParams.id}`);
      setCounselor(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading("approve");
    try {
      await api.post(`/admin/counselors/${counselor.id}/verify`, {});
      fetchCounselor();
    } catch (err) {
      console.error(err);
      alert("Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    const reason = prompt("Enter rejection reason (optional):") || "";
    setActionLoading("reject");
    try {
      await api.post(`/admin/counselors/${counselor.id}/reject?reason=${encodeURIComponent(reason)}`, {});
      fetchCounselor();
    } catch (err) {
      console.error(err);
      alert("Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm("Are you sure you want to deactivate this counselor?")) return;
    setActionLoading("deactivate");
    try {
      await api.post(`/admin/counselors/${counselor.id}/deactivate`, {});
      fetchCounselor();
    } catch (err) {
      console.error(err);
      alert("Failed to deactivate");
    } finally {
      setActionLoading(null);
    }
  };

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

  if (!counselor) {
    return (
      <DashboardLayout role="admin" allowedRoles={["admin"]}>
        <div className="text-center p-8">
          <p className="text-error">Counselor not found.</p>
          <button onClick={() => router.push('/admin/counselors')} className="mt-4 text-primary hover:underline">
            Back to Counselors
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <Link href="/admin/counselors" className="flex items-center gap-2 text-primary hover:underline mb-6 font-label-lg">
        <span className="material-symbols-outlined">arrow_back</span> Back to Counselors
      </Link>
      
      <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary-fixed text-on-primary-fixed rounded-full flex items-center justify-center font-headline-md">
            {counselor.user?.full_name ? counselor.user.full_name[0].toUpperCase() : "?"}
          </div>
          <div>
            <h1 className="font-headline-xl text-primary">{counselor.user?.full_name}</h1>
            <p className="font-body-lg text-on-surface-variant">{counselor.user?.email}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {!counselor.is_verified && (
            <>
              <button 
                onClick={handleApprove}
                disabled={!!actionLoading}
                className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading === "approve" ? "Processing..." : "Approve"}
              </button>
              <button 
                onClick={handleReject}
                disabled={!!actionLoading}
                className="bg-error-container text-on-error-container px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {counselor.is_verified && counselor.is_active && (
            <button 
              onClick={handleDeactivate}
              disabled={!!actionLoading}
              className="bg-error-container text-on-error-container px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
            >
              Deactivate
            </button>
          )}
          {counselor.is_verified && !counselor.is_active && (
            <div className="bg-surface-container px-4 py-2 rounded-lg font-label-md text-on-surface-variant">
              Deactivated
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest mb-6">
        <h2 className="font-headline-md text-primary mb-4 border-b pb-2">Profile Details</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-label-md text-on-surface-variant mb-1">Bio</h3>
            <p className="font-body-md whitespace-pre-wrap">{counselor.bio || "No bio provided."}</p>
          </div>
          <div>
            <h3 className="font-label-md text-on-surface-variant mb-1">Specializations</h3>
            <div className="flex gap-2 flex-wrap">
              {counselor.specialization_tags?.length > 0 ? counselor.specialization_tags.map((tag: string) => (
                <span key={tag} className="bg-surface-container px-3 py-1 rounded-full font-label-sm text-on-surface">{tag}</span>
              )) : (
                <span className="font-body-md text-on-surface-variant italic">None specified.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
        <h2 className="font-headline-md text-primary mb-4 border-b pb-2">Credentials</h2>
        {counselor.credentials_url ? (
          <div>
            <a 
              href={counselor.credentials_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-4 py-2 rounded-lg font-label-md hover:opacity-90"
            >
              <span className="material-symbols-outlined">description</span>
              View Credentials Document
            </a>
          </div>
        ) : (
          <p className="font-body-md text-on-surface-variant italic">No credentials uploaded.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
