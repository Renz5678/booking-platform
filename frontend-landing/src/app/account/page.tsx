"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api, ApiError } from "@/lib/api";
import { useAuth, type User } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { validatePasswordStrength } from "@/lib/validation";

export default function AccountSettingsPage() {
  const { user, checkAuth } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const data = await api.get<User>("/auth/me");
        setEmail(data.email || "");
        setFullName(data.full_name || "");
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, []);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    setNameLoading(true);
    try {
      await api.put("/auth/me", { full_name: fullName.trim() });
      await checkAuth();
      toast.success("Profile name updated.");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to update name.";
      toast.error(msg);
    } finally {
      setNameLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) {
      setPasswordError(pwErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Failed to change password. Check your current password.";
      setPasswordError(msg);
      toast.error(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  const activeRole = user?.role || "client";

  if (loading) {
    return (
      <DashboardLayout role={activeRole} allowedRoles={["client", "counselor", "admin"]}>
        <div className="max-w-2xl mx-auto w-full space-y-6 animate-pulse">
          <div className="h-10 bg-surface-container w-1/2 rounded-lg" />
          <div className="h-48 bg-surface-container rounded-2xl" />
          <div className="h-72 bg-surface-container rounded-2xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={activeRole} allowedRoles={["client", "counselor", "admin"]}>
      <div className="max-w-2xl mx-auto w-full space-y-8">
        <div>
          <h1 className="font-headline-xl text-primary mb-2">Account Settings</h1>
          <p className="font-body-lg text-on-surface-variant">
            Manage your personal details and account security.
          </p>
        </div>

        {/* Profile Information */}
        <section className="bg-surface-container-lowest p-6 md:p-8 rounded-2xl shadow-ambient border border-outline-variant/80">
          <h2 className="font-headline-md text-primary mb-6">Profile Information</h2>
          <form onSubmit={handleUpdateName} className="space-y-4">
            <div>
              <label
                htmlFor="account-email"
                className="block font-label-md text-on-surface mb-1.5"
              >
                Email Address
              </label>
              <input
                id="account-email"
                type="email"
                value={email}
                disabled
                className="w-full border border-outline-variant rounded-lg px-3.5 py-2.5 font-body-md bg-surface-container-low text-on-surface-variant cursor-not-allowed"
              />
              <p className="font-body-sm text-on-surface-variant mt-1.5">
                Email addresses cannot be changed after verification.
              </p>
            </div>
            <div>
              <label
                htmlFor="account-full-name"
                className="block font-label-md text-on-surface mb-1.5"
              >
                Full Name
              </label>
              <input
                id="account-full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full bg-surface border border-outline-variant rounded-lg px-3.5 py-2.5 font-body-md text-on-surface focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={nameLoading}
                className="bg-secondary text-on-secondary px-6 py-2.5 rounded-lg font-label-md hover:opacity-95 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {nameLoading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </section>

        {/* Password */}
        <section className="bg-surface-container-lowest p-6 md:p-8 rounded-2xl shadow-ambient border border-outline-variant/80">
          <h2 className="font-headline-md text-primary mb-6">Change Password</h2>
          {passwordError && (
            <div
              role="alert"
              className="mb-4 p-3.5 rounded-xl bg-error-container text-on-error-container font-body-sm"
            >
              {passwordError}
            </div>
          )}
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label
                htmlFor="current-password"
                className="block font-label-md text-on-surface mb-1.5"
              >
                Current Password
              </label>
              <div className="relative">
                <input
                  id="current-password"
                  name="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full bg-surface border border-outline-variant rounded-lg pl-3.5 pr-11 py-2.5 font-body-md text-on-surface focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant hover:text-primary rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    {showCurrentPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>
            <div>
              <label
                htmlFor="new-password"
                className="block font-label-md text-on-surface mb-1.5"
              >
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  name="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-surface border border-outline-variant rounded-lg pl-3.5 pr-11 py-2.5 font-body-md text-on-surface focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-on-surface-variant hover:text-primary rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    {showNewPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              <p className="font-body-sm text-on-surface-variant mt-1">
                Use at least 8 characters.
              </p>
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="block font-label-md text-on-surface mb-1.5"
              >
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-surface border border-outline-variant rounded-lg px-3.5 py-2.5 font-body-md text-on-surface focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={passwordLoading}
                className="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-label-md hover:opacity-95 transition-opacity disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {passwordLoading ? "Updating…" : "Update Password"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </DashboardLayout>
  );
}
