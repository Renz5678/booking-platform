"use client";

import { useMemo, useState } from "react";

export type WeeklySlotMap = Record<string, Set<number>>;

export interface WeeklySlotGridProps {
  currentWeekStart: Date;
  onWeekChange: (newMonday: Date) => void;
  availableWeeklySlots: WeeklySlotMap;
  loadingSlots: boolean;
  onSelectRange: (dateStr: string, minHour: number, maxHour: number) => void;
  isHighlighted?: (dateStr: string, hour: number) => boolean;
  highlightLabel?: string;
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getManilaHour(isoString: string): number {
  const d = new Date(isoString);
  const manilaStr = d.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: false,
  });
  const hr = parseInt(manilaStr, 10);
  return hr === 24 ? 0 : hr;
}

export function buildManilaSlotIso(dateStr: string, hour: number): string {
  const hrStr = String(hour).padStart(2, "0");
  return `${dateStr}T${hrStr}:00:00+08:00`;
}

function getCurrentWeekMonday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  now.setDate(diff);
  return now;
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${suffix}`;
}

export default function WeeklySlotGrid({
  currentWeekStart,
  onWeekChange,
  availableWeeklySlots,
  loadingSlots,
  onSelectRange,
  isHighlighted,
  highlightLabel = "Selected",
}: WeeklySlotGridProps) {
  const [dragDay, setDragDay] = useState<string | null>(null);
  const [dragStartHour, setDragStartHour] = useState<number | null>(null);
  const [dragEndHour, setDragEndHour] = useState<number | null>(null);

  const thisWeekMonday = useMemo(() => getCurrentWeekMonday(), []);
  const isCurrentWeek =
    formatLocalDate(currentWeekStart) <= formatLocalDate(thisWeekMonday);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      return {
        dateStr: formatLocalDate(d),
        dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
        dateLabel: d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        fullLabel: d.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        }),
      };
    });
  }, [currentWeekStart]);

  const totalOpenSlots = useMemo(() => {
    return weekDays.reduce(
      (sum, d) => sum + (availableWeeklySlots[d.dateStr]?.size || 0),
      0
    );
  }, [weekDays, availableWeeklySlots]);

  const shiftWeek = (offsetDays: number) => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + offsetDays);
    onWeekChange(next);
  };

  const handleMouseDown = (dateStr: string, hour: number, isOpen: boolean) => {
    if (!isOpen) return;
    setDragDay(dateStr);
    setDragStartHour(hour);
    setDragEndHour(hour);
  };

  const handleMouseEnter = (dateStr: string, hour: number, isOpen: boolean) => {
    if (!dragDay || dragDay !== dateStr || dragStartHour === null || !isOpen) {
      return;
    }
    const minH = Math.min(dragStartHour, hour);
    const maxH = Math.max(dragStartHour, hour);
    const daySet = availableWeeklySlots[dateStr];
    for (let h = minH; h <= maxH; h++) {
      if (!daySet?.has(h)) return;
    }
    setDragEndHour(hour);
  };

  const commitDrag = () => {
    if (dragDay && dragStartHour !== null && dragEndHour !== null) {
      const minH = Math.min(dragStartHour, dragEndHour);
      const maxH = Math.max(dragStartHour, dragEndHour);
      onSelectRange(dragDay, minH, maxH);
    }
    setDragDay(null);
    setDragStartHour(null);
    setDragEndHour(null);
  };

  const isInDrag = (dateStr: string, hour: number) => {
    if (dragDay !== dateStr || dragStartHour === null || dragEndHour === null) {
      return false;
    }
    const minH = Math.min(dragStartHour, dragEndHour);
    const maxH = Math.max(dragStartHour, dragEndHour);
    return hour >= minH && hour <= maxH;
  };

  return (
    <div
      className="select-none space-y-4"
      onMouseUp={commitDrag}
      onMouseLeave={commitDrag}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isCurrentWeek || loadingSlots}
            onClick={() => shiftWeek(-7)}
            aria-label="Previous week"
            className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-background px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px]"
            >
              chevron_left
            </span>
            <span>Prev</span>
          </button>

          <button
            type="button"
            disabled={isCurrentWeek || loadingSlots}
            onClick={() => onWeekChange(thisWeekMonday)}
            className="rounded-xl border border-border-subtle bg-background px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            This Week
          </button>

          <button
            type="button"
            disabled={loadingSlots}
            onClick={() => shiftWeek(7)}
            aria-label="Next week"
            className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-background px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>Next</span>
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px]"
            >
              chevron_right
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary-light border border-primary/40" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            {highlightLabel}
          </span>
          <span className="hidden sm:inline text-text-muted">
            Tip: Click or drag down for multi-hour sessions (PHT)
          </span>
        </div>
      </div>

      {/* Empty Week Helper */}
      {!loadingSlots && totalOpenSlots === 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-status-warning/30 bg-status-warning-bg px-4 py-3 text-xs text-status-warning">
          <span>
            No open slots found for this week. Try checking the next week.
          </span>
          <button
            type="button"
            onClick={() => shiftWeek(7)}
            className="shrink-0 font-semibold underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Go to Next Week
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-background">
        <div className="min-w-[640px]">
          {/* Day Headers */}
          <div className="grid grid-cols-8 border-b border-border-subtle bg-surface-muted/60">
            <div className="p-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Time
            </div>
            {weekDays.map((day) => (
              <div
                key={day.dateStr}
                className="border-l border-border-subtle p-2.5 text-center"
              >
                <div className="text-xs font-semibold text-text-primary">
                  {day.dayName}
                </div>
                <div className="text-[11px] text-text-muted tabular-nums">
                  {day.dateLabel}
                </div>
              </div>
            ))}
          </div>

          {/* Hour Rows */}
          {loadingSlots ? (
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
                {weekDays.map((day) => {
                  const isOpen = !!availableWeeklySlots[day.dateStr]?.has(hour);
                  const active =
                    isInDrag(day.dateStr, hour) ||
                    !!isHighlighted?.(day.dateStr, hour);

                  return (
                    <div
                      key={`${day.dateStr}-${hour}`}
                      className="border-l border-border-subtle p-1"
                    >
                      <button
                        type="button"
                        disabled={!isOpen}
                        aria-pressed={active}
                        aria-label={`${day.fullLabel} at ${formatHour(hour)} - ${
                          active
                            ? highlightLabel
                            : isOpen
                              ? "Available"
                              : "Unavailable"
                        }`}
                        onMouseDown={() =>
                          handleMouseDown(day.dateStr, hour, isOpen)
                        }
                        onMouseEnter={() =>
                          handleMouseEnter(day.dateStr, hour, isOpen)
                        }
                        onClick={() => {
                          if (isOpen && !dragDay) {
                            onSelectRange(day.dateStr, hour, hour);
                          }
                        }}
                        className={`h-8 w-full rounded-lg text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          active
                            ? "bg-primary text-white shadow-sm"
                            : isOpen
                              ? "bg-primary-light/70 text-primary hover:bg-primary/20 cursor-pointer"
                              : "bg-surface-muted/40 text-text-muted/40 cursor-not-allowed"
                        }`}
                      >
                        {active ? highlightLabel : isOpen ? "Open" : "—"}
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
  );
}
