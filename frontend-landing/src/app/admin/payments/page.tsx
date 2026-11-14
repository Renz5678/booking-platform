"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";

interface PaymentItem {
  id: string;
  booking_id: string;
  amount: number | string;
  status: string;
  transaction_reference?: string | null;
  review_deadline?: string | null;
  review_reason?: string | null;
}

interface PendingAction {
  payment: PaymentItem;
  decision: "approve" | "reject" | "refund";
}

export default function PaymentQueue() {
  const [page, setPage] = useState(1);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await api.get<PaymentItem[]>(`/payments/manual/queue?page=${page}`);
      setPayments(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const executeAction = async (payment: PaymentItem, decision: "approve" | "reject" | "refund") => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (decision === "refund") {
        const ref = reference[payment.id]?.trim();
        if (!ref) {
          setError("Refund reference is required.");
          setBusy(false);
          return;
        }
        await api.post(`/payments/manual/${payment.booking_id}/refund`, { reference: ref });
        setSuccess(`Refund recorded for booking ${payment.booking_id}.`);
      } else {
        await api.post(`/payments/manual/${payment.booking_id}/review`, {
          decision,
          reason: reason[payment.id] || "",
        });
        setSuccess(
          decision === "approve"
            ? `Payment verified and booking ${payment.booking_id} confirmed.`
            : `Payment rejected and booking ${payment.booking_id} cancelled.`
        );
      }
      setPendingAction(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="p-8 space-y-6">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/admin/reconciliation" className="text-primary hover:underline">
            &larr; Reconciliation Queues
          </Link>
          <span className="text-on-surface-variant">|</span>
          <Link href="/admin/operations" className="text-primary hover:underline">
            Delivery &amp; Contact Inbox &rarr;
          </Link>
        </nav>

        <div>
          <h1 className="text-2xl font-bold text-primary">Payment Review &amp; Refunds</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Verify transfers directly in GCash before approval. References submitted by clients are claims requiring manual verification.
            Expired holds cannot be revived.
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-error-container text-on-error-container p-4 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {success && (
          <div role="status" className="bg-secondary-container text-on-secondary-container p-4 rounded-xl text-sm font-medium">
            {success}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => void load()}
            disabled={busy}
            className="border border-outline-variant bg-surface rounded-lg px-4 py-2 text-sm font-medium hover:bg-surface-container disabled:opacity-50"
          >
            {busy ? "Loading..." : "Refresh Queue"}
          </button>

          <div className="flex items-center gap-2 text-sm">
            <button
              disabled={page === 1 || busy}
              onClick={() => setPage(page - 1)}
              className="border border-outline-variant rounded-lg px-3 py-1.5 hover:bg-surface-container disabled:opacity-50"
            >
              Previous
            </button>
            <span className="font-medium text-on-surface-variant">Page {page}</span>
            <button
              disabled={payments.length < 50 || busy}
              onClick={() => setPage(page + 1)}
              className="border border-outline-variant rounded-lg px-3 py-1.5 hover:bg-surface-container disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {!payments.length && (
          <div className="border border-outline-variant rounded-xl p-8 text-center text-on-surface-variant">
            No items in the manual review queue.
          </div>
        )}

        <div className="space-y-4">
          {payments.map((payment) => (
            <article key={payment.id} className="border border-outline-variant rounded-xl p-6 bg-surface space-y-4 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-outline-variant pb-3">
                <Link
                  href={`/admin/bookings/${payment.booking_id}`}
                  className="font-bold text-primary hover:underline text-base"
                >
                  Booking #{payment.booking_id}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-primary">
                    ₱{Number(payment.amount).toFixed(2)}
                  </span>
                  <span className="bg-surface-container px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider">
                    {payment.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-on-surface-variant font-medium">GCash Reference: </span>
                  <span className="font-mono font-semibold">{payment.transaction_reference || "None submitted"}</span>
                </div>
                {payment.review_deadline && (
                  <div>
                    <span className="text-on-surface-variant font-medium">Review Deadline: </span>
                    <span className="font-semibold text-error">
                      {new Date(payment.review_deadline).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)
                    </span>
                  </div>
                )}
                {payment.review_reason && (
                  <div className="col-span-full">
                    <span className="text-on-surface-variant font-medium">Review Note: </span>
                    <span className="italic">{payment.review_reason}</span>
                  </div>
                )}
              </div>

              {payment.status === "refund_pending" ? (
                <div className="pt-3 border-t border-outline-variant space-y-3">
                  <label className="block text-sm font-medium text-on-surface">
                    Completed Refund Transfer Reference:
                    <input
                      type="text"
                      className="mt-1 block w-full max-w-md border border-outline-variant rounded-lg p-2.5 text-sm"
                      placeholder="e.g. 100234567890"
                      value={reference[payment.id] || ""}
                      onChange={(e) => setReference({ ...reference, [payment.id]: e.target.value })}
                      disabled={busy}
                    />
                  </label>
                  <button
                    className="bg-secondary text-on-secondary rounded-lg px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                    disabled={busy || !reference[payment.id]?.trim()}
                    onClick={() => setPendingAction({ payment, decision: "refund" })}
                  >
                    Record Completed Refund
                  </button>
                </div>
              ) : (
                <div className="pt-3 border-t border-outline-variant space-y-3">
                  <label className="block text-sm font-medium text-on-surface">
                    Review Note:
                    <input
                      maxLength={500}
                      className="mt-1 block w-full max-w-md border border-outline-variant rounded-lg p-2.5 text-sm"
                      placeholder="Optional notes regarding GCash verification"
                      value={reason[payment.id] || ""}
                      onChange={(e) => setReason({ ...reason, [payment.id]: e.target.value })}
                      disabled={busy}
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {payment.status === "review" && (
                      <button
                        className="bg-primary text-on-primary rounded-lg px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => setPendingAction({ payment, decision: "approve" })}
                      >
                        Approve Verified Transfer
                      </button>
                    )}
                    <button
                      className="bg-error-container text-on-error-container rounded-lg px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => setPendingAction({ payment, decision: "reject" })}
                    >
                      Reject / Close Review
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>

        {/* Confirmation Modal */}
        {pendingAction && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-action-title"
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          >
            <div className="bg-surface rounded-xl p-6 max-w-md w-full shadow-lg border border-outline-variant space-y-4">
              <h3 id="confirm-action-title" className="font-bold text-lg text-primary">
                {pendingAction.decision === "approve"
                  ? "Confirm Payment Approval"
                  : pendingAction.decision === "refund"
                  ? "Confirm Refund Recording"
                  : "Confirm Payment Rejection"}
              </h3>
              <p className="text-sm text-on-surface-variant">
                {pendingAction.decision === "approve"
                  ? `Confirm that you independently verified transfer reference "${pendingAction.payment.transaction_reference || "N/A"}" for ₱${Number(pendingAction.payment.amount).toFixed(2)} in your GCash merchant statement. Approving will confirm the booking and schedule the session.`
                  : pendingAction.decision === "refund"
                  ? `Confirm that you have transferred ₱${Number(pendingAction.payment.amount).toFixed(2)} back to the client and entered the actual outgoing GCash transaction reference "${reference[pendingAction.payment.id] || ""}".`
                  : `Rejecting this payment will cancel booking #${pendingAction.payment.booking_id} and permanently release its reserved slot.`}
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  disabled={busy}
                  className="border rounded-lg px-4 py-2 text-sm hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void executeAction(pendingAction.payment, pendingAction.decision)}
                  disabled={busy}
                  className={`rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 ${
                    pendingAction.decision === "approve"
                      ? "bg-primary text-on-primary hover:opacity-90"
                      : pendingAction.decision === "refund"
                      ? "bg-secondary text-on-secondary hover:opacity-90"
                      : "bg-error-container text-on-error-container hover:opacity-90"
                  }`}
                >
                  {busy ? "Processing..." : "Confirm & Proceed"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
