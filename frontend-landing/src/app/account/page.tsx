"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";

export default function AccountSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  
  // Name form
  const [fullName, setFullName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMessage, setNameMessage] = useState({ text: "", type: "" });

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    fetchMe();
  }, []);

  const fetchMe = async () => {
    try {
      const data = await api.get("/auth/me");
      setEmail(data.email || "");
      setFullName(data.full_name || "");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameLoading(true);
    setNameMessage({ text: "", type: "" });
    try {
      await api.put("/auth/me", { full_name: fullName });
      setNameMessage({ text: "Name updated successfully", type: "success" });
    } catch (err) {
      console.error(err);
      setNameMessage({ text: "Failed to update name", type: "error" });
    } finally {
      setNameLoading(false);
      setTimeout(() => setNameMessage({ text: "", type: "" }), 3000);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: "New passwords do not match", type: "error" });
      return;
    }
    setPasswordLoading(true);
    setPasswordMessage({ text: "", type: "" });
    try {
      await api.post("/auth/change-password", { 
        current_password: currentPassword, 
        new_password: newPassword 
      });
      setPasswordMessage({ text: "Password changed successfully", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error(err);
      setPasswordMessage({ text: "Failed to change password", type: "error" });
    } finally {
      setPasswordLoading(false);
      setTimeout(() => setPasswordMessage({ text: "", type: "" }), 3000);
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="client" allowedRoles={["client", "counselor", "admin"]}>
        <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
          <div className="h-40 bg-surface-variant rounded-xl"></div>
          <div className="h-64 bg-surface-variant rounded-xl"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="client" allowedRoles={["client", "counselor", "admin"]}>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="font-headline-xl text-primary mb-2">Account Settings</h1>
          <p className="font-body-lg text-on-surface-variant mb-8">Manage your personal information and security settings.</p>
        </div>

        {/* Profile Information */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest relative">
          {nameMessage.text && (
            <div className={`absolute top-4 right-6 px-3 py-1 rounded font-label-sm ${nameMessage.type === 'success' ? 'bg-secondary text-on-secondary' : 'bg-error text-on-error'}`}>
              {nameMessage.text}
            </div>
          )}
          <h2 className="font-headline-md text-primary mb-6">Profile Information</h2>
          <form onSubmit={handleUpdateName} className="space-y-4">
            <div>
              <label className="block font-label-md text-on-surface mb-1">Email Address</label>
              <input 
                type="email" 
                value={email}
                disabled
                className="w-full border border-surface-variant rounded-lg p-3 font-body-md bg-surface-container-low text-on-surface-variant opacity-70 cursor-not-allowed"
              />
              <p className="font-body-sm text-on-surface-variant mt-1">Email cannot be changed.</p>
            </div>
            <div>
              <label className="block font-label-md text-on-surface mb-1">Full Name</label>
              <input 
                type="text" 
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
              />
            </div>
            <div className="pt-2 flex justify-end">
              <button 
                type="submit" 
                disabled={nameLoading}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-md disabled:opacity-50"
              >
                {nameLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        {/* Password */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest relative">
          {passwordMessage.text && (
            <div className={`absolute top-4 right-6 px-3 py-1 rounded font-label-sm ${passwordMessage.type === 'success' ? 'bg-secondary text-on-secondary' : 'bg-error text-on-error'}`}>
              {passwordMessage.text}
            </div>
          )}
          <h2 className="font-headline-md text-primary mb-6">Change Password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block font-label-md text-on-surface mb-1">Current Password</label>
              <input 
                type="password" 
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
              />
            </div>
            <div>
              <label className="block font-label-md text-on-surface mb-1">New Password</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
              />
            </div>
            <div>
              <label className="block font-label-md text-on-surface mb-1">Confirm New Password</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
              />
            </div>
            <div className="pt-2 flex justify-end">
              <button 
                type="submit" 
                disabled={passwordLoading}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-md disabled:opacity-50"
              >
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
