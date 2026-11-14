"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface PaymentReferenceFormProps {
  bookingId: string;
  submitted?: boolean;
  onSubmitted?: () => void;
}

export default function PaymentReferenceForm({
  bookingId,
  submitted = false,
  onSubmitted,
}: PaymentReferenceFormProps) {
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(submitted);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<{ status: string }>(`/payments/manual/${bookingId}/submit`, {
        reference: reference.trim(),
      });
      setDone(true);
      setMessage({
        type: "success",
        text:
          result.status === "review"
            ? "Reference submitted. Your payment is awaiting administrator verification."
            : "Reference recorded for support reconciliation. Your slot has not been confirmed.",
      });
      if (onSubmitted) {
        onSubmitted();
      }
    } catch (error: unknown) {
      setMessage({
        type: "error",
        text: (error as Error).message || "Failed to submit reference. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-surface border border-outline-variant rounded-xl p-6 space-y-4 text-left shadow-sm">
      <div>
        <h2 className="font-bold text-lg text-primary">Submit Your GCash Transaction Reference</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Submit within 15 minutes of booking. Submitting a reference records a verification claim — an administrator must
          verify the transfer in GCash before the session is confirmed.
        </p>
      </div>

      {message && (
        <div
          role={message.type === "error" ? "alert" : "status"}
          className={`p-3 rounded-lg text-sm font-medium ${
            message.type === "error"
              ? "bg-error-container text-on-error-container"
              : "bg-secondary-container text-on-secondary-container"
          }`}
        >
          {message.text}
        </div>
      )}

      {done ? (
        <div className="bg-surface-container-low p-4 rounded-lg text-sm text-on-surface">
          <p className="font-medium text-primary">Your reference has been recorded.</p>
          <p className="text-on-surface-variant text-xs mt-1">
            An administrator is verifying the incoming funds. You can track this booking on your dashboard.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="gcash-reference">
              GCash Reference Number
            </label>
            <input
              id="gcash-reference"
              type="text"
              className="block w-full border border-outline-variant rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. 100234567890"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              minLength={6}
              maxLength={64}
              required
              disabled={busy}
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Find this 10 to 13-digit reference number in your GCash SMS or transaction receipt.
            </p>
          </div>
          <button
            type="submit"
            disabled={busy || reference.trim().length < 6}
            className="w-full bg-primary text-on-primary font-bold py-3 px-4 rounded-xl text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy ? "Submitting Reference..." : "Submit Reference"}
          </button>
        </form>
      )}
    </section>
  );
}
