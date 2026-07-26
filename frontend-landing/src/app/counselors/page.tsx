"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface CounselorProfile {
  id: string;
  bio: string | null;
  specialization_tags: string[];
  user: {
    id: string;
    full_name: string;
  };
}

export default function FindCounselorPage() {
  const [counselors, setCounselors] = useState<CounselorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounselors = async () => {
      try {
        const res = await fetch("http://localhost:8000/counselors");
        if (res.ok) {
          const data = await res.json();
          setCounselors(data);
        }
      } catch (err) {
        console.error("Failed to fetch counselors:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCounselors();
  }, []);

  return (
    <DashboardLayout role="client" allowedRoles={["client"]}>
      <div className="max-w-5xl mx-auto">
        <h1 className="font-headline-xl text-primary mb-2">Find a Counselor</h1>
        <p className="font-body-lg text-on-surface-variant mb-8">Browse our network of professional therapists and book a session today.</p>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-surface-variant/20 animate-pulse"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-1/2 bg-surface-variant/30 rounded animate-pulse"></div>
                    <div className="h-3 w-1/3 bg-surface-variant/20 rounded animate-pulse"></div>
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  <div className="h-4 w-full bg-surface-variant/20 rounded animate-pulse"></div>
                  <div className="h-4 w-5/6 bg-surface-variant/20 rounded animate-pulse"></div>
                  <div className="h-4 w-4/6 bg-surface-variant/20 rounded animate-pulse"></div>
                </div>
                <div className="flex gap-2 mb-6">
                  <div className="h-6 w-20 bg-surface-variant/30 rounded-full animate-pulse"></div>
                  <div className="h-6 w-24 bg-surface-variant/30 rounded-full animate-pulse"></div>
                </div>
                <div className="h-12 w-full bg-surface-variant/30 rounded-lg animate-pulse"></div>
              </div>
            ))}
          </div>
        ) : counselors.length === 0 ? (
          <div className="bg-surface-container-low p-8 rounded-xl text-center text-on-surface-variant">
            No counselors are currently available. Please check back later!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {counselors.map((counselor) => (
              <div key={counselor.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-primary-container text-2xl">
                    <span className="material-symbols-outlined">person</span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-primary font-bold">{counselor.user.full_name}</h3>
                    <p className="font-label-sm text-on-surface-variant">Licensed Counselor</p>
                  </div>
                </div>
                <p className="font-body-md text-on-surface-variant line-clamp-3 mb-4 min-h-[72px]">
                  {counselor.bio || "No biography provided yet."}
                </p>
                <div className="flex flex-wrap gap-2 mb-6 min-h-[28px]">
                  {counselor.specialization_tags.map(tag => (
                    <span key={tag} className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm">
                      {tag}
                    </span>
                  ))}
                  {counselor.specialization_tags.length === 0 && (
                    <span className="text-on-surface-variant italic font-label-sm">General Counseling</span>
                  )}
                </div>
                <button className="w-full bg-secondary text-on-secondary font-label-md py-3 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-sm">
                  Book Session
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
