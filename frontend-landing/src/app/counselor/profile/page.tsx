"use client";

import { useEffect, useState } from "react";
import { CounselorProfile } from "@/types";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function CounselorProfilePage() {
  const [profile, setProfile] = useState<CounselorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch("http://localhost:8000/counselors/me/profile", {
          credentials: "include"
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  return (
    <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
      <div className="max-w-3xl mx-auto">
        <h1 className="font-headline-xl text-primary mb-2">My Profile</h1>
        <p className="font-body-lg text-on-surface-variant mb-8">Manage your public information and verification status.</p>

        {loading ? (
          <div className="bg-surface-container-lowest p-8 rounded-xl shadow-sm border border-outline-variant space-y-6">
            <div className="space-y-2">
              <div className="h-4 w-16 bg-surface-variant/20 rounded animate-pulse"></div>
              <div className="h-8 w-48 bg-surface-variant/30 rounded animate-pulse"></div>
            </div>
            <div className="border-t border-outline-variant pt-6 space-y-2">
              <div className="h-4 w-24 bg-surface-variant/20 rounded animate-pulse"></div>
              <div className="h-4 w-full bg-surface-variant/20 rounded animate-pulse"></div>
              <div className="h-4 w-5/6 bg-surface-variant/20 rounded animate-pulse"></div>
            </div>
            <div className="border-t border-outline-variant pt-6 space-y-2">
              <div className="h-4 w-32 bg-surface-variant/20 rounded animate-pulse"></div>
              <div className="flex gap-2 mt-2">
                <div className="h-6 w-20 bg-surface-variant/30 rounded-full animate-pulse"></div>
                <div className="h-6 w-24 bg-surface-variant/30 rounded-full animate-pulse"></div>
              </div>
            </div>
            <div className="pt-4">
              <div className="h-10 w-32 bg-surface-variant/30 rounded-lg animate-pulse"></div>
            </div>
          </div>
        ) : !profile ? (
          <div className="bg-error-container text-on-error-container p-4 rounded-xl">
            Could not load profile.
          </div>
        ) : (
          <div className="bg-surface-container-lowest p-8 rounded-xl shadow-sm border border-outline-variant space-y-6">
            <div>
              <p className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">Status</p>
              <p className="font-headline-md text-primary mt-1">
                {profile.is_verified ? (
                  <span className="text-secondary flex items-center gap-2"><span className="material-symbols-outlined">verified</span> Verified & Active</span>
                ) : (
                  <span className="text-error flex items-center gap-2"><span className="material-symbols-outlined">pending</span> Pending Verification</span>
                )}
              </p>
            </div>
            
            <div className="border-t border-outline-variant pt-6">
              <p className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Biography</p>
              <p className="font-body-md text-on-surface">{profile.bio || "No bio set."}</p>
            </div>

            <div className="border-t border-outline-variant pt-6">
              <p className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Specializations</p>
              <div className="flex flex-wrap gap-2">
                {profile.specialization_tags.map((tag: string) => (
                  <span key={tag} className="bg-surface-container-high px-3 py-1 rounded-full font-label-sm">{tag}</span>
                ))}
                {profile.specialization_tags.length === 0 && <p className="font-body-md text-on-surface-variant italic">None provided</p>}
              </div>
            </div>
            
            <div className="pt-4">
              <button className="bg-secondary text-on-secondary px-6 py-2 rounded-lg font-label-md hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-sm">Edit Profile</button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
