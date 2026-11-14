"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import type { CounselorProfile } from "@/types";

export default function CounselorProfileSetupPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCred, setUploadingCred] = useState(false);

  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [specializationsText, setSpecializationsText] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [gcashQrUrl, setGcashQrUrl] = useState<string | null>(null);
  const [gcashQrFile, setGcashQrFile] = useState<File | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [credentialUrl, setCredentialUrl] = useState<string | null>(null);
  const [credentialFile, setCredentialFile] = useState<File | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const profile = await api.get<CounselorProfile>(
        "/counselors/me/profile"
      );
      setBio(profile.bio || "");
      setPhotoUrl(profile.photo_url || "");
      setSpecializationsText((profile.specialization_tags || []).join(", "));
      setGcashNumber(profile.gcash_number || "");
      setGcashQrUrl(profile.gcash_qr_url || null);
      setCredentialUrl(profile.credentials_url || null);
    } catch {
      toast.error("Unable to load your counselor profile.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const specialization_tags = specializationsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      await api.put("/counselors/me/profile", {
        bio: bio.trim() || null,
        photo_url: photoUrl.trim() || null,
        specialization_tags,
        gcash_number: gcashNumber.trim() || null,
      });
      toast.success("Profile updated successfully.");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Unable to update profile.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCredentialChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setCredentialFile(file);
  };

  const handleUploadCredential = async (e: FormEvent) => {
    e.preventDefault();
    if (!credentialFile) {
      toast.error("Please choose a credential file to upload.");
      return;
    }

    setUploadingCred(true);
    try {
      const formData = new FormData();
      formData.append("file", credentialFile);
      const res = await api.post<{ credentials_url?: string }>(
        "/counselors/me/credentials",
        formData
      );
      if (res?.credentials_url) {
        setCredentialUrl(res.credentials_url);
      }
      setCredentialFile(null);
      toast.success("PRC credential uploaded for review.");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Failed to upload credential.";
      toast.error(msg);
    } finally {
      setUploadingCred(false);
    }
  };

  const handleGcashQrChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setGcashQrFile(file);
  };

  const handleUploadGcashQr = async (e: FormEvent) => {
    e.preventDefault();
    if (!gcashQrFile) {
      toast.error("Please choose a GCash QR image (JPG or PNG).");
      return;
    }

    setUploadingQr(true);
    try {
      const formData = new FormData();
      formData.append("file", gcashQrFile);
      const res = await api.post<{ gcash_qr_url?: string }>(
        "/counselors/me/gcash-qr",
        formData
      );
      if (res?.gcash_qr_url) {
        setGcashQrUrl(res.gcash_qr_url);
      }
      setGcashQrFile(null);
      toast.success("GCash QR code uploaded.");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Failed to upload GCash QR code.";
      toast.error(msg);
    } finally {
      setUploadingQr(false);
    }
  };

  const handleRemoveGcashQr = async () => {
    setUploadingQr(true);
    try {
      await api.put("/counselors/me/profile", { gcash_qr_url: null });
      setGcashQrUrl(null);
      toast.success("GCash QR code removed.");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Failed to remove GCash QR code.";
      toast.error(msg);
    } finally {
      setUploadingQr(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["counselor"]}>
      <DashboardLayout role="counselor">
        <div className="space-y-6">
          <div>
            <h1 className="font-serif text-headline-lg text-text-primary">
              Profile &amp; Credentials
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Keep your public bio, specializations, and PRC documentation up to
              date.
            </p>
          </div>

          {loading ? (
            <div className="h-80 animate-pulse rounded-2xl border border-border-subtle bg-surface-elevated" />
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleSaveProfile}
                className="space-y-5 rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient lg:col-span-7"
              >
                <div>
                  <label
                    htmlFor="profile-photo"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Profile Photo URL (Optional)
                  </label>
                  <input
                    id="profile-photo"
                    type="url"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://…"
                    className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-specs"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Specializations (comma-separated)
                  </label>
                  <input
                    id="profile-specs"
                    type="text"
                    value={specializationsText}
                    onChange={(e) => setSpecializationsText(e.target.value)}
                    placeholder="Anxiety, Depression, Stress & Burnout, Relationships"
                    className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-gcash"
                    className="block text-sm font-medium text-text-primary"
                  >
                    GCash Number (for client payments)
                  </label>
                  <input
                    id="profile-gcash"
                    type="tel"
                    value={gcashNumber}
                    onChange={(e) => setGcashNumber(e.target.value)}
                    placeholder="0917 123 4567"
                    className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Shown to clients after they book a session with you so they
                    can send payment.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="profile-bio"
                    className="block text-sm font-medium text-text-primary"
                  >
                    Clinical Bio &amp; Approach
                  </label>
                  <textarea
                    id="profile-bio"
                    rows={5}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe your background, therapeutic modalities, and how you support clients…"
                    className="mt-1.5 w-full rounded-xl border border-border-subtle bg-background px-4 py-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {saving ? "Saving…" : "Save Profile"}
                </button>
              </form>

              <div className="space-y-6 lg:col-span-5">
                <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
                  <h2 className="font-serif text-xl font-medium text-text-primary">
                    GCash QR Code
                  </h2>
                  <p className="mt-1 text-xs text-text-secondary">
                    Upload your GCash QR code (JPG or PNG) so clients can scan
                    to pay for their session.
                  </p>

                  {gcashQrUrl && (
                    <div className="mt-4 rounded-xl border border-border-subtle bg-background p-4 text-center">
                      <img
                        src={gcashQrUrl}
                        alt="Your GCash QR code"
                        className="mx-auto max-h-48 rounded-lg bg-white p-2 object-contain"
                      />
                      <button
                        type="button"
                        disabled={uploadingQr}
                        onClick={handleRemoveGcashQr}
                        className="mt-3 text-xs font-semibold text-status-danger hover:underline disabled:opacity-50"
                      >
                        Remove QR Code
                      </button>
                    </div>
                  )}

                  <form
                    onSubmit={handleUploadGcashQr}
                    className="mt-5 space-y-4"
                  >
                    <div>
                      <label
                        htmlFor="gcash-qr-file"
                        className="block text-xs font-semibold uppercase tracking-wider text-text-muted"
                      >
                        Upload QR Image
                      </label>
                      <input
                        id="gcash-qr-file"
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleGcashQrChange}
                        className="mt-2 block w-full rounded-xl border border-border-subtle bg-background p-2.5 text-xs text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                      />
                      {gcashQrFile && (
                        <p className="mt-1.5 text-xs text-text-secondary">
                          Selected: <strong>{gcashQrFile.name}</strong>
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingQr || !gcashQrFile}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-border-subtle bg-background px-5 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {uploadingQr ? "Uploading…" : "Upload GCash QR"}
                    </button>
                  </form>
                </div>

                <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-ambient">
                <h2 className="font-serif text-xl font-medium text-text-primary">
                  PRC Verification Document
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Upload your PRC ID or certificate (PDF or image) for admin
                  review.
                </p>

                {credentialUrl && (
                  <div className="mt-4 rounded-xl border border-status-success/30 bg-status-success-bg p-3.5 text-xs text-status-success">
                    <p className="font-semibold">Credential on file</p>
                    <a
                      href={credentialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-medium underline"
                    >
                      View uploaded document
                    </a>
                  </div>
                )}

                <form
                  onSubmit={handleUploadCredential}
                  className="mt-5 space-y-4"
                >
                  <div>
                    <label
                      htmlFor="credential-file"
                      className="block text-xs font-semibold uppercase tracking-wider text-text-muted"
                    >
                      Upload New File
                    </label>
                    <input
                      id="credential-file"
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleCredentialChange}
                      className="mt-2 block w-full rounded-xl border border-border-subtle bg-background p-2.5 text-xs text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                    />
                    {credentialFile && (
                      <p className="mt-1.5 text-xs text-text-secondary">
                        Selected: <strong>{credentialFile.name}</strong>
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingCred || !credentialFile}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-border-subtle bg-background px-5 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {uploadingCred ? "Uploading…" : "Upload Credential"}
                  </button>
                </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
