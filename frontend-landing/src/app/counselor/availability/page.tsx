"use client";

import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/context/ToastContext";
import { api, ApiError } from "@/lib/api";
import type { AvailabilityBlock } from "@/types";

const DAYS = [
  { index: 0, label: "Mon", full: "Monday" },
  { index: 1, label: "Tue", full: "Tuesday" },
  { index: 2, label: "Wed", full: "Wednesday" },
  { index: 3, label: "Thu", full: "Thursday" },
  { index: 4, label: "Fri", full: "Friday" },
  { index: 5, label: "Sat", full: "Saturday" },
  { index: 6, label: "Sun", full: "Sunday" },
];

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${suffix}`;
}

function slotKey(day: number, hour: number): string {
  return `${day}-${hour}`;
}

function blocksToSet(blocks: AvailabilityBlock[]): Set<string> {
  const set = new Set<string>();
  blocks.forEach((b) => {
    if (b.day_of_week === null) return;
    const startH = parseInt(b.start_time.split(":")[0], 10);
    const endH = parseInt(b.end_time.split(":")[0], 10);
    for (let h = startH; h < endH; h++) {
      if (HOURS.includes(h)) {
        set.add(slotKey(b.day_of_week, h));
      }
    }
  });
  return set;
}

function setToBlocks(set: Set<string>) {
  const blocks: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_recurring: boolean;
  }> = [];
  DAYS.forEach((day) => {
    let rangeStart: number | null = null;
    HOURS.forEach((hr, idx) => {
      const selected = set.has(slotKey(day.index, hr));
      if (selected && rangeStart === null) {
        rangeStart = hr;
      }
      const isLast = idx === HOURS.length - 1;
      if ((!selected || isLast) && rangeStart !== null) {
        const rangeEnd = selected && isLast ? hr + 1 : hr;
        blocks.push({
          day_of_week: day.index,
          start_time: `${String(rangeStart).padStart(2, "0")}:00:00`,
          end_time: `${String(rangeEnd).padStart(2, "0")}:00:00`,
          is_recurring: true,
        });
        rangeStart = null;
      }
    });
  });
  return blocks;
}

export default function CounselorAvailabilityPage() {
  const { toast } = useToast();
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAvailability = useCallback(async () => {
    try {
      const blocks = await api.get<AvailabilityBlock[]>(
        "/availability/me/blocks"
      );
      if (Array.isArray(blocks)) {
        const set = blocksToSet(blocks);
        setSelectedSlots(set);
        setSavedSnapshot(Array.from(set).sort().join(","));
      }
    } catch {
      toast.error("Unable to load your weekly availability.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const hasUnsavedChanges =
    Array.from(selectedSlots).sort().join(",") !== savedSnapshot;

  const toggleSlot = (day: number, hour: number) => {
    const key = slotKey(day, hour);
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyWeekdaysPreset = () => {
    const next = new Set<string>();
    for (let d = 0; d <= 4; d++) {
      for (let h = 9; h <= 16; h++) {
        next.add(slotKey(d, h));
      }
    }
    setSelectedSlots(next);
  };

  const clearAll = () => {
    setSelectedSlots(new Set());
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const blocks = setToBlocks(selectedSlots);
      await api.put("/availability/me/blocks", { blocks });
      setSavedSnapshot(Array.from(selectedSlots).sort().join(","));
      toast.success("Weekly availability saved.");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Failed to save availability.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={["counselor"]}>
      <DashboardLayout role="counselor">
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-serif text-headline-lg text-text-primary">
                  Weekly Availability
                </h1>
                {hasUnsavedChanges && (
                  <span className="rounded-full bg-status-warning-bg px-2.5 py-0.5 text-xs font-semibold text-status-warning">
                    Unsaved changes
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                Set your recurring weekly hours in Philippine Time (UTC+8).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={applyWeekdaysPreset}
                className="rounded-xl border border-border-subtle bg-surface-elevated px-3.5 py-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Weekdays 9 AM–5 PM
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded-xl border border-border-subtle bg-surface-elevated px-3.5 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Clear All
              </button>
              <button
                type="button"
                disabled={saving || !hasUnsavedChanges}
                onClick={handleSave}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {saving ? "Saving…" : "Save Availability"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface-elevated shadow-ambient">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-8 border-b border-border-subtle bg-surface-muted/60">
                <div className="p-3 text-center text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Time
                </div>
                {DAYS.map((d) => (
                  <div
                    key={d.index}
                    className="border-l border-border-subtle p-3 text-center text-xs font-semibold text-text-primary"
                  >
                    {d.label}
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="h-9 animate-pulse rounded-lg bg-surface-muted"
                    />
                  ))}
                </div>
              ) : (
                HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="grid grid-cols-8 border-b border-border-subtle last:border-b-0"
                  >
                    <div className="flex items-center justify-center px-2 py-2 text-xs font-medium text-text-secondary tabular-nums">
                      {formatHour(hour)}
                    </div>
                    {DAYS.map((day) => {
                      const active = selectedSlots.has(
                        slotKey(day.index, hour)
                      );
                      return (
                        <div
                          key={`${day.index}-${hour}`}
                          className="border-l border-border-subtle p-1.5"
                        >
                          <button
                            type="button"
                            aria-pressed={active}
                            aria-label={`${day.full} at ${formatHour(hour)} - ${
                              active ? "Available" : "Unavailable"
                            }`}
                            onClick={() => toggleSlot(day.index, hour)}
                            className={`h-8 w-full rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              active
                                ? "bg-primary text-white shadow-sm"
                                : "bg-background text-text-muted hover:bg-surface-muted"
                            }`}
                          >
                            {active ? "Open" : "—"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
