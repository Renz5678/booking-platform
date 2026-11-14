"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger";
}

export interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  required?: boolean;
  variant?: "primary" | "danger";
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  promptText: (options: PromptOptions) => Promise<string | null>;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);
  const [promptState, setPromptState] = useState<{
    options: PromptOptions;
    value: string;
    resolve: (value: string | null) => void;
  } | null>(null);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      const timer = setTimeout(() => {
        dismissToast(id);
      }, 4500);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const promptText = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({
        options,
        value: options.defaultValue || "",
        resolve,
      });
    });
  }, []);

  // Focus & Escape handling for modals
  useEffect(() => {
    if (!confirmState && !promptState) return;

    if (confirmState) {
      setTimeout(() => confirmCancelRef.current?.focus(), 0);
    } else if (promptState) {
      setTimeout(() => promptInputRef.current?.focus(), 0);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmState) {
          confirmState.resolve(false);
          setConfirmState(null);
        } else if (promptState) {
          promptState.resolve(null);
          setPromptState(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmState, promptState]);

  const toastApi = React.useMemo(
    () => ({
      success: (msg: string) => addToast(msg, "success"),
      error: (msg: string) => addToast(msg, "error"),
      info: (msg: string) => addToast(msg, "info"),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toast: toastApi, confirm, promptText }}>
      {children}

      {/* Live Toast Region */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((item) => {
          const styles =
            item.variant === "success"
              ? "bg-secondary-container text-on-secondary-container border-secondary/30"
              : item.variant === "error"
                ? "bg-error-container text-on-error-container border-error/30"
                : "bg-surface-container-lowest text-on-surface border-outline-variant";
          const icon =
            item.variant === "success"
              ? "check_circle"
              : item.variant === "error"
                ? "error"
                : "info";

          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-xl border shadow-ambient animate-slide-up ${styles}`}
            >
              <span
                className="material-symbols-outlined text-[20px] shrink-0 mt-0.5"
                aria-hidden="true"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {icon}
              </span>
              <p className="font-body-sm font-medium flex-1 min-w-0 break-words">
                {item.message}
              </p>
              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                aria-label="Dismiss notification"
                className="shrink-0 p-1 -m-1 rounded-md opacity-70 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirm Dialog */}
      {confirmState && (
        <div
          data-lenis-prevent
          className="fixed inset-0 z-[100] bg-primary/40 backdrop-blur-[2px] flex items-center justify-center p-4 overscroll-contain animate-fade-in"
          onClick={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 max-w-md w-full shadow-ambient animate-scale-in"
          >
            <h2
              id="confirm-dialog-title"
              className="font-headline-md text-primary mb-2"
            >
              {confirmState.options.title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="font-body-md text-on-surface-variant mb-6"
            >
              {confirmState.options.message}
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5">
              <button
                ref={confirmCancelRef}
                type="button"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface font-label-md hover:bg-surface-container-low transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {confirmState.options.cancelText || "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
                className={`min-h-[44px] sm:min-h-[38px] px-5 py-2.5 rounded-lg font-label-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  confirmState.options.variant === "danger"
                    ? "bg-error text-on-error"
                    : "bg-primary text-on-primary"
                }`}
              >
                {confirmState.options.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Dialog */}
      {promptState && (
        <div
          data-lenis-prevent
          className="fixed inset-0 z-[100] bg-primary/40 backdrop-blur-[2px] flex items-center justify-center p-4 overscroll-contain animate-fade-in"
          onClick={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-dialog-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (promptState.options.required && !promptState.value.trim()) return;
              promptState.resolve(promptState.value);
              setPromptState(null);
            }}
            className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 max-w-md w-full shadow-ambient animate-scale-in"
          >
            <h2
              id="prompt-dialog-title"
              className="font-headline-md text-primary mb-2"
            >
              {promptState.options.title}
            </h2>
            {promptState.options.message && (
              <p className="font-body-md text-on-surface-variant mb-4">
                {promptState.options.message}
              </p>
            )}
            <div className="mb-6">
              {promptState.options.label && (
                <label
                  htmlFor="prompt-dialog-input"
                  className="block font-label-sm text-on-surface-variant mb-1.5"
                >
                  {promptState.options.label}
                </label>
              )}
              <textarea
                id="prompt-dialog-input"
                ref={promptInputRef}
                rows={3}
                required={promptState.options.required}
                value={promptState.value}
                onChange={(e) =>
                  setPromptState((prev) =>
                    prev ? { ...prev, value: e.target.value } : null
                  )
                }
                placeholder={promptState.options.placeholder || "Enter details…"}
                className="w-full bg-surface border border-outline-variant rounded-lg p-3 font-body-md text-on-surface focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  promptState.resolve(null);
                  setPromptState(null);
                }}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2.5 rounded-lg border border-outline-variant text-on-surface font-label-md hover:bg-surface-container-low transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {promptState.options.cancelText || "Cancel"}
              </button>
              <button
                type="submit"
                className={`min-h-[44px] sm:min-h-[38px] px-5 py-2.5 rounded-lg font-label-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  promptState.options.variant === "danger"
                    ? "bg-error text-on-error"
                    : "bg-primary text-on-primary"
                }`}
              >
                {promptState.options.confirmText || "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
