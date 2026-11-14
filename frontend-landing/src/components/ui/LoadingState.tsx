"use client";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-3.5 w-3.5 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}

interface PageLoadingStateProps {
  label?: string;
}

export function PageLoadingState({
  label = "Loading…",
}: PageLoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 py-12 text-center"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle bg-surface-elevated shadow-ambient">
        <Spinner size="md" className="text-primary" />
      </div>
      <p className="text-sm font-medium text-text-secondary">{label}</p>
    </div>
  );
}

interface DetailPageSkeletonProps {
  label?: string;
}

export function DetailPageSkeleton({
  label = "Loading details…",
}: DetailPageSkeletonProps) {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3.5 py-1.5 text-xs font-medium text-text-secondary shadow-sm">
        <Spinner size="sm" className="text-primary" />
        <span>{label}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 animate-pulse">
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="h-3 w-24 rounded bg-surface-muted" />
                <div className="h-7 w-2/3 rounded-lg bg-surface-muted" />
              </div>
              <div className="h-6 w-24 rounded-full bg-surface-muted" />
            </div>
            <div className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-5 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="h-3 w-20 rounded bg-surface-muted" />
                <div className="h-4 w-40 rounded bg-surface-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-20 rounded bg-surface-muted" />
                <div className="h-4 w-40 rounded bg-surface-muted" />
              </div>
            </div>
            <div className="h-20 rounded-xl bg-surface-muted/70" />
          </div>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 space-y-4">
            <div className="h-5 w-1/2 rounded bg-surface-muted" />
            <div className="h-4 w-full rounded bg-surface-muted" />
            <div className="h-4 w-4/5 rounded bg-surface-muted" />
            <div className="h-10 w-full rounded-xl bg-surface-muted mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
