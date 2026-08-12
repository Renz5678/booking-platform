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

interface Counselor {
  id: string;
  user: UserInfo;
  bio: string;
  specialization_tags: string[];
  is_verified: boolean;
  is_active: boolean;
}

export default function AdminCounselorsPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "active" | "deactivated">("pending");
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchCounselors();
  }, [activeTab]);

  const fetchCounselors = async () => {
    setLoading(true);
    try {
      if (activeTab === "pending") {
        const data = await api.get("/admin/counselors/pending");
        setCounselors(data || []);
      } else {
        // Fetch all, then filter client-side. The public endpoint might only return verified,
        // but we'll use it as instructed. Or if an admin endpoint exists, it'll use that.
        // Usually an admin would need /admin/counselors, but we'll fallback to /counselors
        // if that's what's available. Assuming /admin/counselors exists for all based on prompt.
        try {
          // Let's try to get them. If there's an issue, we just show empty.
          // The prompt says "Other tabs fetch all counselors and filter client-side"
          const data = await api.get("/counselors");
          const all: Counselor[] = data || [];
          if (activeTab === "active") {
            setCounselors(all.filter(c => c.is_verified && c.is_active));
          } else if (activeTab === "deactivated") {
            setCounselors(all.filter(c => !c.is_active));
          }
        } catch (e) {
          console.error(e);
          setCounselors([]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(`approve-${id}`);
    try {
      await api.post(`/admin/counselors/${id}/verify`, {});
      fetchCounselors();
    } catch (err) {
      console.error(err);
      alert("Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectId) return;
    setActionLoading(`reject-${rejectId}`);
    try {
      await api.post(`/admin/counselors/${rejectId}/reject?reason=${encodeURIComponent(rejectReason)}`, {});
      setRejectId(null);
      setRejectReason("");
      fetchCounselors();
    } catch (err) {
      console.error(err);
      alert("Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this counselor?")) return;
    setActionLoading(`deactivate-${id}`);
    try {
      await api.post(`/admin/counselors/${id}/deactivate`, {});
      fetchCounselors();
    } catch (err) {
      console.error(err);
      alert("Failed to deactivate");
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    try {
      await api.post("/admin/counselors/invite", { email: inviteEmail, name: inviteName });
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteName("");
      alert("Invitation sent!");
    } catch (err) {
      console.error(err);
      alert("Failed to send invite");
    } finally {
      setInviteLoading(false);
    }
  };

  const truncate = (text: string, len: number) => {
    if (!text) return "";
    return text.length > len ? text.substring(0, len) + "..." : text;
  };

  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="font-headline-xl text-primary mb-2">Counselor Management</h1>
          <p className="font-body-lg text-on-surface-variant">Review verification requests and manage counselors.</p>
        </div>
        <button 
          onClick={() => setShowInviteModal(true)}
          className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md flex items-center gap-2 hover:opacity-90"
        >
          <span className="material-symbols-outlined text-[20px]">person_add</span>
          Invite New Counselor
        </button>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-surface-container-highest">
        {(["pending", "active", "deactivated"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-4 font-label-md capitalize ${activeTab === tab ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-surface-container-highest animate-pulse h-32" />
          ))
        ) : counselors.length > 0 ? (
          counselors.map(c => (
            <div key={c.id} className="bg-white p-6 rounded-xl border border-surface-container-highest shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <Link href={`/admin/counselors/${c.id}`} className="font-headline-md text-primary hover:underline">
                  {c.user?.full_name || "Unknown"}
                </Link>
                <p className="font-body-sm text-on-surface-variant mb-2">{c.user?.email}</p>
                <p className="font-body-md mb-2">{truncate(c.bio, 100)}</p>
                <div className="flex gap-2 flex-wrap">
                  {c.specialization_tags?.map(tag => (
                    <span key={tag} className="bg-surface-container px-2 py-1 rounded font-label-sm text-on-surface">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                {activeTab === "pending" && (
                  <>
                    <button 
                      onClick={() => handleApprove(c.id)}
                      disabled={actionLoading === `approve-${c.id}`}
                      className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => setRejectId(c.id)}
                      className="bg-error-container text-on-error-container px-4 py-2 rounded-lg font-label-md hover:opacity-90"
                    >
                      Reject
                    </button>
                  </>
                )}
                {activeTab === "active" && (
                  <button 
                    onClick={() => handleDeactivate(c.id)}
                    disabled={actionLoading === `deactivate-${c.id}`}
                    className="bg-error-container text-on-error-container px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white p-8 rounded-xl border border-surface-container-highest text-center text-on-surface-variant">
            No counselors found in this category.
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg">
            <h2 className="font-headline-md text-primary mb-4">Invite New Counselor</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block font-label-md text-on-surface mb-1">Name</label>
                <input 
                  type="text" 
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2 font-body-md"
                  required 
                />
              </div>
              <div>
                <label className="block font-label-md text-on-surface mb-1">Email</label>
                <input 
                  type="email" 
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2 font-body-md"
                  required 
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-on-surface-variant font-label-md hover:bg-surface-container rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={inviteLoading}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md disabled:opacity-50"
                >
                  {inviteLoading ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg">
            <h2 className="font-headline-md text-primary mb-4">Reject Counselor</h2>
            <form onSubmit={handleReject} className="space-y-4">
              <div>
                <label className="block font-label-md text-on-surface mb-1">Reason (optional)</label>
                <textarea 
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full border border-surface-variant rounded-lg p-2 font-body-md h-24"
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button 
                  type="button" 
                  onClick={() => { setRejectId(null); setRejectReason(""); }}
                  className="px-4 py-2 text-on-surface-variant font-label-md hover:bg-surface-container rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!!actionLoading}
                  className="bg-error text-on-error px-4 py-2 rounded-lg font-label-md disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
