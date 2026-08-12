"use client";

import { useEffect, useState, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CounselorProfile {
  id: string;
  bio: string;
  specialization_tags: string[];
  is_verified: boolean;
  is_active: boolean;
  credentials_url?: string;
}

export default function CounselorProfilePage() {
  const [profile, setProfile] = useState<CounselorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ text: "", type: "" });

  // Credential upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState({ text: "", type: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const data = await api.get("/counselors/me/profile");
      setProfile(data);
      setBio(data.bio || "");
      setTags(data.specialization_tags?.join(", ") || "");
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage({ text: "", type: "" });
    try {
      const tagsArray = tags.split(",").map(t => t.trim()).filter(t => t);
      const updated = await api.put("/counselors/me/profile", { bio, specialization_tags: tagsArray });
      setProfile(updated);
      setIsEditing(false);
      setProfileMessage({ text: "Profile updated successfully!", type: "success" });
    } catch (err) {
      console.error(err);
      setProfileMessage({ text: "Failed to update profile.", type: "error" });
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMessage({ text: "", type: "" }), 3000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setUploadMessage({ text: "File exceeds 5MB limit.", type: "error" });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setSelectedFile(file);
      setUploadMessage({ text: "", type: "" });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadMessage({ text: "", type: "" });
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      
      const res = await fetch(`${API_URL}/counselors/me/credentials`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      
      if (!res.ok) throw new Error("Upload failed");
      
      const data = await res.json();
      setProfile(prev => prev ? { ...prev, credentials_url: data.credentials_url } : null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadMessage({ text: "Credentials uploaded successfully!", type: "success" });
    } catch (err) {
      console.error(err);
      setUploadMessage({ text: "Failed to upload credentials.", type: "error" });
    } finally {
      setUploading(false);
      setTimeout(() => setUploadMessage({ text: "", type: "" }), 3000);
    }
  };

  return (
    <DashboardLayout role="counselor" allowedRoles={["counselor"]}>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="font-headline-xl text-primary mb-2">My Profile</h1>
          <p className="font-body-lg text-on-surface-variant mb-8">Manage your public information, specializations, and credentials.</p>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-6">
            <div className="h-48 bg-surface-variant rounded-xl"></div>
            <div className="h-48 bg-surface-variant rounded-xl"></div>
          </div>
        ) : !profile ? (
          <div className="bg-error-container text-on-error-container p-4 rounded-xl">
            Could not load profile.
          </div>
        ) : (
          <>
            {/* Status Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
              <h2 className="font-headline-md text-primary mb-4">Verification Status</h2>
              {profile.is_verified ? (
                <div className="flex items-center gap-2 text-secondary font-headline-sm">
                  <span className="material-symbols-outlined">verified</span> Verified & Active
                </div>
              ) : (
                <div className="flex items-center gap-2 text-error font-headline-sm">
                  <span className="material-symbols-outlined">pending</span> Pending Verification
                </div>
              )}
            </div>

            {/* Profile Info Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest relative">
              {profileMessage.text && (
                <div className={`absolute top-4 right-6 px-3 py-1 rounded font-label-sm ${profileMessage.type === 'success' ? 'bg-secondary text-on-secondary' : 'bg-error text-on-error'}`}>
                  {profileMessage.text}
                </div>
              )}
              
              <div className="flex justify-between items-center mb-6 border-b border-surface-variant pb-2">
                <h2 className="font-headline-md text-primary">Public Information</h2>
                {!isEditing && (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="text-primary font-label-md hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span> Edit Profile
                  </button>
                )}
              </div>

              {isEditing ? (
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block font-label-md text-on-surface mb-1">Biography</label>
                    <textarea 
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full border border-surface-variant rounded-lg p-3 font-body-md h-32"
                      placeholder="Write a short bio about yourself..."
                    />
                  </div>
                  <div>
                    <label className="block font-label-md text-on-surface mb-1">Specializations (comma-separated)</label>
                    <input 
                      type="text"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
                      placeholder="e.g. Anxiety, Depression, Career Coaching"
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button 
                      type="button" 
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 text-on-surface-variant font-label-md hover:bg-surface-container rounded-lg"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={savingProfile}
                      className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-md disabled:opacity-50"
                    >
                      {savingProfile ? "Saving..." : "Save Profile"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Biography</h3>
                    <p className="font-body-md whitespace-pre-wrap">{profile.bio || "No bio set."}</p>
                  </div>
                  <div>
                    <h3 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Specializations</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.specialization_tags?.length > 0 ? profile.specialization_tags.map(tag => (
                        <span key={tag} className="bg-surface-container-high text-on-surface px-3 py-1 rounded-full font-label-sm">{tag}</span>
                      )) : (
                        <p className="font-body-md text-on-surface-variant italic">None provided</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Credentials Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest relative">
              {uploadMessage.text && (
                <div className={`absolute top-4 right-6 px-3 py-1 rounded font-label-sm ${uploadMessage.type === 'success' ? 'bg-secondary text-on-secondary' : 'bg-error text-on-error'}`}>
                  {uploadMessage.text}
                </div>
              )}
              
              <h2 className="font-headline-md text-primary mb-4 border-b border-surface-variant pb-2">Credentials</h2>
              
              {profile.credentials_url && (
                <div className="mb-6">
                  <p className="font-label-md text-on-surface-variant mb-2">Current Credentials</p>
                  <a 
                    href={profile.credentials_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-secondary-container text-on-secondary-container px-4 py-2 rounded-lg font-label-md hover:opacity-90"
                  >
                    <span className="material-symbols-outlined">description</span> View Credentials
                  </a>
                </div>
              )}
              
              <div>
                <p className="font-label-md text-on-surface-variant mb-2">Upload New Credentials</p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <input 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    className="font-body-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-fixed file:text-on-primary-fixed hover:file:bg-primary-fixed/80"
                  />
                  {selectedFile && (
                    <button 
                      onClick={handleUpload}
                      disabled={uploading}
                      className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md disabled:opacity-50 min-w-[120px]"
                    >
                      {uploading ? "Uploading..." : "Submit"}
                    </button>
                  )}
                </div>
                <p className="font-body-sm text-on-surface-variant mt-2">Accepted formats: PDF, JPG, PNG. Max size: 5MB.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
