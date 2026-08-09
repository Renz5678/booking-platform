"use client";

import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";

export default function AccountPage() {
  const { user } = useAuth();
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  if (!user) return null;

  return (
    <DashboardLayout role={user.role} allowedRoles={["client", "counselor", "admin"]}>
      <div className="max-w-2xl mx-auto py-8">
        <h1 className="font-headline-xl text-primary mb-6">Account Settings</h1>
        
        {success && (
          <div className="bg-secondary-container text-on-secondary-container p-4 rounded-lg mb-6 text-sm">
            {success}
          </div>
        )}
        
        {error && (
          <div className="bg-error-container text-on-error-container p-4 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        <div className="bg-surface rounded-xl shadow-ambient p-8 space-y-6 font-body-md text-on-surface">
          <div>
            <label className="block text-[12px] font-semibold tracking-wider text-on-surface-variant mb-1 ml-1">Full Name</label>
            <input 
              type="text"
              value={user.full_name}
              disabled
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-4 py-3 text-[16px] text-on-surface opacity-70 cursor-not-allowed" 
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold tracking-wider text-on-surface-variant mb-1 ml-1">Email Address</label>
            <input 
              type="email"
              value={user.email}
              disabled
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-4 py-3 text-[16px] text-on-surface opacity-70 cursor-not-allowed" 
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold tracking-wider text-on-surface-variant mb-1 ml-1">Role</label>
            <input 
              type="text"
              value={user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              disabled
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-4 py-3 text-[16px] text-on-surface opacity-70 cursor-not-allowed" 
            />
          </div>
          
          <div className="pt-6 border-t border-surface-container flex justify-between items-center">
            <div>
              <h3 className="font-label-lg font-bold text-primary">Google Calendar</h3>
              <p className="text-sm text-on-surface-variant">Sync your bookings to your calendar.</p>
            </div>
            {user.google_calendar_connected ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary-container text-on-secondary-container font-label-md">
                <span className="material-symbols-outlined text-[18px]">check_circle</span> Connected
              </span>
            ) : (
              <a href={`http://localhost:8000/auth/google/${user.role}/login`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md shadow-sm hover:opacity-90 transition-opacity">
                Connect
              </a>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
