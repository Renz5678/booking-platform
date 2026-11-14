"use client";

import { useEffect, useState, use } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CounselorDetail {
  id: string;
  bio?: string;
  specialization_tags?: string[];
  is_verified: boolean;
  is_active: boolean;
  has_credentials?: boolean;
  photo_url?: string;
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export default function AdminCounselorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [counselor, setCounselor] = useState<CounselorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Dialog states for reject and deactivate
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);

  // Credential download UX state
  const [downloadingCreds, setDownloadingCreds] = useState(false);
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const [credError, setCredError] = useState<string | null>(null);

  useEffect(() => {
    fetchCounselor();
  }, [resolvedParams.id]);

  const fetchCounselor = async () => {
    try {
      const data = await api.get<CounselorDetail>(`/admin/counselors/${resolvedParams.id}`);
      setCounselor(data);
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: "error", text: "Failed to load counselor details." });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading("approve");
    setStatusMessage(null);
    try {
      await api.post(`/admin/counselors/${counselor?.id}/verify`, {});
      setStatusMessage({ type: "success", text: "Counselor verified successfully." });
      await fetchCounselor();
    } catch (err: unknown) {
      setStatusMessage({ type: "error", text: (err as Error).message || "Failed to approve counselor." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading("reject");
    setStatusMessage(null);
    try {
      await api.post(`/admin/counselors/${counselor?.id}/reject?reason=${encodeURIComponent(rejectReason)}`, {});
      setShowRejectModal(false);
      setRejectReason("");
      setStatusMessage({ type: "success", text: "Counselor profile rejected." });
      await fetchCounselor();
    } catch (err: unknown) {
      setStatusMessage({ type: "error", text: (err as Error).message || "Failed to reject counselor." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmDeactivate = async () => {
    setActionLoading("deactivate");
    setStatusMessage(null);
    try {
      await api.post(`/admin/counselors/${counselor?.id}/deactivate`, {});
      setShowDeactivateModal(false);
      setStatusMessage({ type: "success", text: "Counselor account deactivated." });
      await fetchCounselor();
    } catch (err: unknown) {
      setStatusMessage({ type: "error", text: (err as Error).message || "Failed to deactivate counselor." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadCredentials = async () => {
    if (!counselor?.id) return;
    setDownloadingCreds(true);
    setPopupBlockedUrl(null);
    setCredError(null);
    try {
      const result = await api.get<{ url: string }>(`/counselors/${counselor.id}/credentials/download`);
      const newWin = window.open(result.url, "_blank", "noopener,noreferrer");
      if (!newWin || newWin.closed || typeof newWin.closed === "undefined") {
        setPopupBlockedUrl(result.url);
        setTimeout(() => setPopupBlockedUrl(null), 60000);
      }
    } catch (err: unknown) {
      setCredError((err as Error).message || "Failed to retrieve credential document.");
    } finally {
      setDownloadingCreds(false);
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
          <button onClick={() => router.push("/admin/counselors")} className="mt-4 text-primary hover:underline">
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

      {statusMessage && (
        <div
          role={statusMessage.type === "error" ? "alert" : "status"}
          className={`p-4 rounded-xl mb-6 text-sm ${
            statusMessage.type === "error"
              ? "bg-error-container text-on-error-container"
              : "bg-secondary-container text-on-secondary-container"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

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
                onClick={() => setShowRejectModal(true)}
                disabled={!!actionLoading}
                className="bg-error-container text-on-error-container px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {counselor.is_verified && counselor.is_active && (
            <button
              onClick={() => setShowDeactivateModal(true)}
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
              {counselor.specialization_tags && counselor.specialization_tags.length > 0 ? (
                counselor.specialization_tags.map((tag: string) => (
                  <span key={tag} className="bg-surface-container px-3 py-1 rounded-full font-label-sm text-on-surface">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="font-body-md text-on-surface-variant italic">None specified.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
        <h2 className="font-headline-md text-primary mb-4 border-b pb-2">Credentials</h2>
        {counselor.has_credentials ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadCredentials}
                disabled={downloadingCreds}
                className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">description</span>
                {downloadingCreds ? "Retrieving document..." : "View Credentials Document"}
              </button>
              {credError && (
                <button
                  type="button"
                  onClick={handleDownloadCredentials}
                  className="text-primary hover:underline text-sm font-medium"
                >
                  Retry
                </button>
              )}
            </div>
            {popupBlockedUrl && (
              <div role="status" className="bg-secondary-container text-on-secondary-container p-3 rounded-lg text-sm flex items-center justify-between">
                <span>Popup blocked. Open credentials document directly:</span>
                <a
                  href={popupBlockedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPopupBlockedUrl(null)}
                  className="font-bold underline ml-2"
                >
                  Open Document
                </a>
              </div>
            )}
            {credError && (
              <div role="alert" className="bg-error-container text-on-error-container p-3 rounded-lg text-sm">
                {credError}
              </div>
            )}
          </div>
        ) : (
          <p className="font-body-md text-on-surface-variant italic">No credentials uploaded.</p>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-counselor-title"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-surface rounded-xl p-6 max-w-md w-full shadow-lg border border-outline-variant space-y-4">
            <h3 id="reject-counselor-title" className="font-bold text-lg text-primary">Reject Counselor Profile</h3>
            <p className="text-sm text-on-surface-variant">
              Provide an optional note describing why the profile is rejected. The counselor will need to resubmit their application.
            </p>
            <form onSubmit={handleConfirmReject} className="space-y-4">
              <label className="block text-sm font-medium text-on-surface">
                Rejection Reason (Optional)
                <input
                  type="text"
                  maxLength={500}
                  className="mt-1 block w-full border rounded-lg p-2.5 text-sm"
                  placeholder="e.g. Unverified license number"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  disabled={actionLoading === "reject"}
                  className="border rounded-lg px-4 py-2 text-sm hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === "reject"}
                  className="bg-error-container text-on-error-container rounded-lg px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading === "reject" ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {showDeactivateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-counselor-title"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-surface rounded-xl p-6 max-w-md w-full shadow-lg border border-outline-variant space-y-4">
            <h3 id="deactivate-counselor-title" className="font-bold text-lg text-primary">Deactivate Counselor Account</h3>
            <p className="text-sm text-on-surface-variant">
              Are you sure you want to deactivate {counselor.user?.full_name}? The counselor will no longer appear in search or receive new bookings.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeactivateModal(false)}
                disabled={actionLoading === "deactivate"}
                className="border rounded-lg px-4 py-2 text-sm hover:bg-surface-container"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={actionLoading === "deactivate"}
                className="bg-error-container text-on-error-container rounded-lg px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading === "deactivate" ? "Deactivating..." : "Confirm Deactivation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
