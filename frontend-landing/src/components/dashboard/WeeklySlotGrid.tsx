"use client";

import React, { useState } from "react";

export interface WeeklySlotMap {
  [dateStr: string]: {
    available: string[];
    occupied: string[];
  };
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_LABELS = [
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
];

const manilaHourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  hourCycle: "h23",
});

export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getManilaHour(isoString: string): number {
  const parts = manilaHourFormatter.formatToParts(new Date(isoString));
  const hourPart = parts.find((p) => p.type === "hour")?.value;
  return hourPart ? Number(hourPart) % 24 : new Date(isoString).getHours();
}

export function buildManilaSlotIso(dateStr: string, hour: number): string {
  return `${dateStr}T${String(hour).padStart(2, "0")}:00:00+08:00`;
}

interface WeeklySlotGridProps {
  currentWeekStart: Date;
  onWeekChange: (nextWeekStart: Date) => void;
  availableWeeklySlots: WeeklySlotMap;
  loadingSlots: boolean;
  onSelectRange: (dateStr: string, minHour: number, maxHour: number) => void;
  isHighlighted?: (dateStr: string, hour: number, slotIsoStr: string) => boolean;
  highlightLabel?: string;
}

export default function WeeklySlotGrid({
  currentWeekStart,
  onWeekChange,
  availableWeeklySlots,
  loadingSlots,
  onSelectRange,
  isHighlighted,
  highlightLabel,
}: WeeklySlotGridProps) {
  const [dragSelection, setDragSelection] = useState<{
    dateStr: string;
    startHour: number;
    endHour: number;
  } | null>(null);

  const shiftWeek = (days: number) => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + days);
    onWeekChange(next);
  };

  const todayStr = formatLocalDate(new Date());

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-surface p-3 rounded-lg border border-outline-variant">
        <button
          type="button"
          onClick={() => shiftWeek(-7)}
          className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-label-md"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span> Prev
        </button>
        <span className="font-label-lg text-primary font-medium">
          Week of {currentWeekStart.toLocaleDateString([], { month: "short", day: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => shiftWeek(7)}
          className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-label-md"
        >
          Next <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </div>

      <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface relative min-h-[300px]">
        {loadingSlots && (
          <div className="absolute inset-0 bg-surface/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
              progress_activity
            </span>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 py-4 border-b border-surface-container bg-surface-container-lowest">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-secondary-container"></div>
            <span className="font-label-sm text-on-surface-variant">Available</span>
          </div>
          {highlightLabel && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-400"></div>
              <span className="font-label-sm text-on-surface-variant">{highlightLabel}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-primary"></div>
            <span className="font-label-sm text-on-surface-variant">Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-error"></div>
            <span className="font-label-sm text-on-surface-variant">Occupied</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-surface-container border border-dashed border-outline-variant/50"></div>
            <span className="font-label-sm text-on-surface-variant">Unavailable</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[700px] p-4">
            <div className="grid grid-cols-8 gap-2 mb-2 text-center border-b border-outline-variant pb-2">
              <div className="font-label-sm text-[12px] font-semibold text-on-surface-variant uppercase flex items-end justify-center">
                Time
              </div>
              {Array.from({ length: 7 }).map((_, i) => {
                const d = new Date(currentWeekStart);
                d.setDate(d.getDate() + i);
                const isToday = formatLocalDate(d) === todayStr;
                return (
                  <div
                    key={i}
                    className={`flex flex-col items-center ${isToday ? "text-secondary" : "text-primary"}`}
                  >
                    <span className="font-label-sm uppercase opacity-70">{DAY_NAMES[i]}</span>
                    <span className="font-label-lg font-bold">{d.getDate()}</span>
                  </div>
                );
              })}
            </div>

            <div
              className="grid grid-cols-8 gap-x-2 gap-y-0"
              onMouseUp={() => {
                if (!dragSelection) return;
                const minHour = Math.min(dragSelection.startHour, dragSelection.endHour);
                const maxHour = Math.max(dragSelection.startHour, dragSelection.endHour);
                const slotsForDay = availableWeeklySlots[dragSelection.dateStr]?.available || [];

                let allAvailable = true;
                for (let h = minHour; h <= maxHour; h++) {
                  const slotIso = buildManilaSlotIso(dragSelection.dateStr, h);
                  const isPast = new Date(slotIso) < new Date();
                  const hasSlot = slotsForDay.some((slotStr) => getManilaHour(slotStr) === h);
                  if (!hasSlot || isPast) {
                    allAvailable = false;
                    break;
                  }
                }

                if (allAvailable) {
                  onSelectRange(dragSelection.dateStr, minHour, maxHour);
                }
                setDragSelection(null);
              }}
              onMouseLeave={() => setDragSelection(null)}
            >
              {TIME_LABELS.map((label, timeIndex) => (
                <React.Fragment key={label}>
                  <div className="font-label-sm text-[12px] font-semibold text-on-surface-variant text-right pr-2 py-1 flex items-center justify-end h-10">
                    {label}
                  </div>
                  {Array.from({ length: 7 }).map((_, dayIndex) => {
                    const d = new Date(currentWeekStart);
                    d.setDate(d.getDate() + dayIndex);
                    const dateStr = formatLocalDate(d);

                    const startHour = 8 + timeIndex;
                    const slotTimeIsoStr = buildManilaSlotIso(dateStr, startHour);
                    const slotsForDay = availableWeeklySlots[dateStr] || {
                      available: [],
                      occupied: [],
                    };

                    const isAvailable = slotsForDay.available?.some(
                      (slotStr) => getManilaHour(slotStr) === startHour
                    );
                    const isOccupied = slotsForDay.occupied?.some(
                      (slotStr) => getManilaHour(slotStr) === startHour
                    );
                    const isPast = new Date(slotTimeIsoStr) < new Date();

                    const isSelected = Boolean(
                      dragSelection &&
                        dragSelection.dateStr === dateStr &&
                        startHour >= Math.min(dragSelection.startHour, dragSelection.endHour) &&
                        startHour <= Math.max(dragSelection.startHour, dragSelection.endHour)
                    );
                    const highlighted = isHighlighted?.(dateStr, startHour, slotTimeIsoStr) ?? false;

                    if (isOccupied && !isPast) {
                      return (
                        <div
                          key={`${dayIndex}-${timeIndex}`}
                          className="h-10 bg-error flex items-center justify-center shadow-sm"
                        />
                      );
                    }
                    if (isAvailable && !isPast) {
                      return (
                        <div
                          key={`${dayIndex}-${timeIndex}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setDragSelection({ dateStr, startHour, endHour: startHour });
                          }}
                          onMouseEnter={() => {
                            if (dragSelection && dragSelection.dateStr === dateStr) {
                              setDragSelection({ ...dragSelection, endHour: startHour });
                            }
                          }}
                          className={`h-10 transition-colors cursor-pointer text-[10px] font-bold flex items-center justify-center select-none shadow-sm ${
                            isSelected
                              ? "bg-primary text-on-primary"
                              : highlighted
                                ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-500"
                                : "bg-secondary-container text-on-secondary-container hover:bg-[#65de7e]"
                          }`}
                        />
                      );
                    }
                    return (
                      <div
                        key={`${dayIndex}-${timeIndex}`}
                        className="h-10 bg-surface-container border-x border-dashed border-outline-variant/50 flex items-center justify-center opacity-50"
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
