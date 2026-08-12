"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";

interface ContentItem {
  key: string;
  value: string;
}

export default function AdminContentPage() {
  const [contentMap, setContentMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const data: ContentItem[] = await api.get("/admin/content");
      const map: Record<string, string> = {};
      data.forEach(item => {
        map[item.key] = item.value;
      });
      setContentMap(map);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key: string) => {
    setSavingKey(key);
    try {
      await api.put(`/admin/content/${key}`, { value: contentMap[key] || "" });
      alert("Saved successfully");
    } catch (err) {
      console.error(err);
      alert("Failed to save");
    } finally {
      setSavingKey(null);
    }
  };

  const handleChange = (key: string, value: string) => {
    setContentMap(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <DashboardLayout role="admin" allowedRoles={["admin"]}>
        <div className="animate-pulse space-y-6 max-w-4xl">
          <div className="h-48 bg-surface-variant rounded-xl"></div>
          <div className="h-48 bg-surface-variant rounded-xl"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <h1 className="font-headline-xl text-primary mb-2">Content Management</h1>
      <p className="font-body-lg text-on-surface-variant mb-8">Update dynamic text and configuration across the platform.</p>

      <div className="space-y-8 max-w-4xl">
        {/* Homepage Quotes */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline-md text-primary">Homepage Quotes</h2>
            <button 
              onClick={() => handleSave("homepage_quotes")}
              disabled={savingKey === "homepage_quotes"}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
            >
              {savingKey === "homepage_quotes" ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="font-body-sm text-on-surface-variant mb-4">Provide a JSON array of strings.</p>
          <textarea
            value={contentMap["homepage_quotes"] || ""}
            onChange={(e) => handleChange("homepage_quotes", e.target.value)}
            className="w-full h-40 border border-surface-variant rounded-lg p-3 font-body-md font-mono text-sm"
            placeholder={'["Quote 1", "Quote 2"]'}
          />
        </div>

        {/* FAQ Entries */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline-md text-primary">FAQ Entries</h2>
            <button 
              onClick={() => handleSave("faq_entries")}
              disabled={savingKey === "faq_entries"}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
            >
              {savingKey === "faq_entries" ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="font-body-sm text-on-surface-variant mb-4">Provide a JSON array of objects with `question` and `answer` properties.</p>
          <textarea
            value={contentMap["faq_entries"] || ""}
            onChange={(e) => handleChange("faq_entries", e.target.value)}
            className="w-full h-64 border border-surface-variant rounded-lg p-3 font-body-md font-mono text-sm"
            placeholder={'[{"question": "...", "answer": "..."}]'}
          />
        </div>

        {/* Crisis Banner */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-container-highest">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline-md text-primary">Crisis Banner Text</h2>
            <button 
              onClick={() => handleSave("crisis_banner_text")}
              disabled={savingKey === "crisis_banner_text"}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
            >
              {savingKey === "crisis_banner_text" ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="font-body-sm text-on-surface-variant mb-4">Plain text displayed at the top of the site in case of emergency.</p>
          <input
            type="text"
            value={contentMap["crisis_banner_text"] || ""}
            onChange={(e) => handleChange("crisis_banner_text", e.target.value)}
            className="w-full border border-surface-variant rounded-lg p-3 font-body-md"
            placeholder="In a crisis? Call Hopeline..."
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
