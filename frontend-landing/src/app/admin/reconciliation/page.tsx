"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import {
  PaymentClaimItem,
  RefundObligationItem,
  ClaimsQueueResponse,
  RefundsQueueResponse,
} from "@/lib/contracts";

export default function ReconciliationPage() {
  // Claims Queue state
  const [claims, setClaims] = useState<PaymentClaimItem[]>([]);
  const [claimsPage, setClaimsPage] = useState(1);
  const [claimsHasMore, setClaimsHasMore] = useState(false);
  const [claimsLoading, setClaimsLoading] = useState(false);

  // Refunds Queue state
  const [refunds, setRefunds] = useState<RefundObligationItem[]>([]);
  const [refundsPage, setRefundsPage] = useState(1);
  const [refundsHasMore, setRefundsHasMore] = useState(false);
  const [refundsLoading, setRefundsLoading] = useState(false);

  // Action states
  const [actionBusy, setActionBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    try {
      const data = await api.get<ClaimsQueueResponse>(`/payments/manual/claims/queue?page=${claimsPage}`);
      setClaims(data.items || []);
      setClaimsHasMore(Boolean(data.has_more));
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load claims queue");
    } finally {
      setClaimsLoading(false);
    }
  }, [claimsPage]);

  const loadRefunds = useCallback(async () => {
    setRefundsLoading(true);
    try {
      const data = await api.get<RefundsQueueResponse>(`/payments/manual/refunds/queue?page=${refundsPage}`);
      setRefunds(data.items || []);
      setRefundsHasMore(Boolean(data.has_more));
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load refunds queue");
    } finally {
      setRefundsLoading(false);
    }
  }, [refundsPage]);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  const handleClaimDecision = (claim: PaymentClaimItem, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    const form = new FormData(e.currentTarget);
    const decision = String(form.get("decision") || "reject");
    const reason = String(form.get("reason") || "").trim();
    const amountVal = form.get("amount");
    const amount = amountVal ? parseFloat(String(amountVal)) : 0;

    if (reason.length < 3) {
      setErrorMessage("A reason of at least 3 characters is required for any money reconciliation decision.");
      return;
    }

    if ((decision === "refund" || decision === "allocate") && amount <= 0) {
      setErrorMessage("Please enter the actual received PHP amount verified in GCash.");
      return;
    }

    let description = "";
    if (decision === "reject") {
      description = `Reject claim ${claim.reference}. The client will be informed that the transfer could not be found.`;
    } else if (decision === "duplicate") {
      description = `Close claim ${claim.reference} as duplicate. No new funds or obligations will be created.`;
    } else if (decision === "allocate") {
      description = `Allocate PHP ${amount.toFixed(2)} with reference ${claim.reference} to booking ${claim.booking_id}. The booking will move to review for final approval.`;
    } else if (decision === "refund") {
      description = `Create a full refund obligation of PHP ${amount.toFixed(2)} for late transfer ${claim.reference}. The booking will remain cancelled.`;
    }

    setConfirmDialog({
      title: `Confirm Decision: ${decision.toUpperCase()}`,
      description,
      onConfirm: async () => {
        setActionBusy(true);
        try {
          await api.post(`/payments/manual/claims/${claim.id}/reconcile`, {
            decision,
            reason,
            amount,
          });
          setStatusMessage(`Claim ${claim.reference} successfully reconciled (${decision}).`);
          await loadClaims();
          if (decision === "refund") await loadRefunds();
        } catch (err: any) {
          setErrorMessage(err.message || "Failed to reconcile claim");
        } finally {
          setActionBusy(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleCompleteRefund = (transfer: RefundObligationItem, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    const form = new FormData(e.currentTarget);
    const reference = String(form.get("reference") || "").trim();

    if (reference.length < 6) {
      setErrorMessage("Provide a valid GCash outgoing refund reference (min 6 chars).");
      return;
    }

    setConfirmDialog({
      title: "Confirm Refund Completion",
      description: `Confirm that PHP ${transfer.amount} has been actually transferred to the client via GCash and record outgoing reference ${reference}.`,
      onConfirm: async () => {
        setActionBusy(true);
        try {
          await api.post(`/payments/manual/transfers/${transfer.id}/refund`, { reference });
          setStatusMessage(`Refund of PHP ${transfer.amount} successfully marked completed.`);
          await loadRefunds();
        } catch (err: any) {
          setErrorMessage(err.message || "Failed to complete refund transfer");
        } finally {
          setActionBusy(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  return (
    <DashboardLayout role="admin" allowedRoles={["admin"]}>
      <div className="max-w-6xl mx-auto space-y-8 p-4 sm:p-6">
        <div>
          <h1 className="font-headline-xl text-primary font-bold">Transfer Reconciliation</h1>
          <p className="font-body-md text-on-surface-variant mt-1">
            Authoritative ledger for manual GCash claims and refund obligations. Verify all amounts directly in your GCash merchant portal before confirming decisions.
          </p>
        </div>

        {errorMessage && (
          <div role="alert" aria-live="assertive" className="p-4 bg-error/10 border border-error text-error rounded-xl font-body-sm flex items-start gap-2">
            <span className="material-symbols-outlined shrink-0 text-base">error</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div role="status" aria-live="polite" className="p-4 bg-secondary/10 border border-secondary text-secondary rounded-xl font-body-sm flex items-start gap-2">
            <span className="material-symbols-outlined shrink-0 text-base">check_circle</span>
            <span>{statusMessage}</span>
          </div>
        )}

        {/* SECTION 1: Open Claims Queue */}
        <section className="bg-white rounded-2xl shadow-sm border border-surface-container-highest p-6 space-y-6">
          <div className="flex justify-between items-center border-b pb-4">
            <div>
              <h2 className="font-headline-md text-primary font-bold">Open Payment Claims</h2>
              <p className="font-body-xs text-on-surface-variant">Claims submitted by clients awaiting admin review or reconciliation</p>
            </div>
            <button
              onClick={() => loadClaims()}
              disabled={claimsLoading || actionBusy}
              className="text-xs px-3 py-1.5 border rounded-lg hover:bg-surface-container disabled:opacity-50"
            >
              Refresh Claims
            </button>
          </div>

          {claimsLoading ? (
            <p className="text-on-surface-variant text-sm py-4">Loading open claims...</p>
          ) : claims.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic py-4">No open claims in the queue.</p>
          ) : (
            <div className="space-y-4">
              {claims.map((claim) => (
                <form
                  key={claim.id}
                  onSubmit={(e) => handleClaimDecision(claim, e)}
                  className="border border-surface-container-highest rounded-xl p-5 bg-surface-container-low/30 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container pb-3">
                    <div>
                      <span className="font-label-md font-bold text-primary">Ref: {claim.reference}</span>
                      <span className="text-xs text-on-surface-variant ml-3">Booking: {claim.booking_id}</span>
                      {claim.booking_status && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-surface-container uppercase">
                          {claim.booking_status}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-on-surface-variant">
                      {new Date(claim.created_at).toLocaleString()}
                    </span>
                  </div>

                  {claim.reason && (
                    <p className="text-xs text-on-surface-variant italic">Note: {claim.reason}</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-on-surface mb-1">Decision</label>
                      <select
                        name="decision"
                        defaultValue="reject"
                        disabled={actionBusy}
                        className="w-full text-xs p-2 border border-surface-container-highest rounded-lg bg-white"
                      >
                        <option value="reject">Reject claim (Not found / Invalid)</option>
                        <option value="duplicate">Close as duplicate (Already accounted)</option>
                        {claim.eligible_for_allocation && (
                          <option value="allocate">Allocate funds to this held booking</option>
                        )}
                        <option value="refund">Verify received funds &amp; queue full refund</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface mb-1">
                        Actual Received Amount (PHP)
                      </label>
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={claim.payment_amount || "300.00"}
                        disabled={actionBusy}
                        className="w-full text-xs p-2 border border-surface-container-highest rounded-lg bg-white"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-on-surface mb-1">
                        Auditable Reason (Required)
                      </label>
                      <input
                        name="reason"
                        type="text"
                        required
                        minLength={3}
                        maxLength={500}
                        disabled={actionBusy}
                        placeholder="Verified in GCash portal..."
                        className="w-full text-xs p-2 border border-surface-container-highest rounded-lg bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="px-4 py-2 bg-primary text-on-primary text-xs font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
                    >
                      Record Decision
                    </button>
                  </div>
                </form>
              ))}

              {/* Claims Pagination */}
              <div className="flex items-center justify-between pt-4 border-t border-surface-container">
                <button
                  type="button"
                  disabled={claimsPage <= 1 || actionBusy}
                  onClick={() => setClaimsPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-on-surface-variant">Claims Page {claimsPage}</span>
                <button
                  type="button"
                  disabled={!claimsHasMore || actionBusy}
                  onClick={() => setClaimsPage((p) => p + 1)}
                  className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        {/* SECTION 2: Refund Obligations Queue */}
        <section className="bg-white rounded-2xl shadow-sm border border-surface-container-highest p-6 space-y-6">
          <div className="flex justify-between items-center border-b pb-4">
            <div>
              <h2 className="font-headline-md text-primary font-bold">Pending Refund Obligations</h2>
              <p className="font-body-xs text-on-surface-variant">Verified transfers requiring an actual completed GCash refund to the client</p>
            </div>
            <button
              onClick={() => loadRefunds()}
              disabled={refundsLoading || actionBusy}
              className="text-xs px-3 py-1.5 border rounded-lg hover:bg-surface-container disabled:opacity-50"
            >
              Refresh Refunds
            </button>
          </div>

          {refundsLoading ? (
            <p className="text-on-surface-variant text-sm py-4">Loading refunds...</p>
          ) : refunds.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic py-4">No pending refund obligations.</p>
          ) : (
            <div className="space-y-4">
              {refunds.map((refundItem) => (
                <form
                  key={refundItem.id}
                  onSubmit={(e) => handleCompleteRefund(refundItem, e)}
                  className="border border-surface-container-highest rounded-xl p-5 bg-surface-container-low/30 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container pb-3">
                    <div>
                      <span className="font-label-md font-bold text-error">Refund Due: ₱{parseFloat(refundItem.amount).toFixed(2)}</span>
                      <span className="text-xs text-on-surface-variant ml-3">Original Incoming Ref: {refundItem.reference}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-surface-container uppercase">
                        {refundItem.source}
                      </span>
                    </div>
                    <span className="text-xs text-on-surface-variant">
                      {new Date(refundItem.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-on-surface mb-1">
                        Completed Outgoing GCash Reference (Required)
                      </label>
                      <input
                        name="reference"
                        type="text"
                        required
                        minLength={6}
                        maxLength={64}
                        disabled={actionBusy}
                        placeholder="GCash reference from your outgoing transfer receipt..."
                        className="w-full text-xs p-2 border border-surface-container-highest rounded-lg bg-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={actionBusy}
                      className="px-4 py-2 bg-secondary text-on-secondary text-xs font-medium rounded-lg hover:bg-secondary-hover disabled:opacity-50 shrink-0"
                    >
                      Record Completed Refund
                    </button>
                  </div>
                </form>
              ))}

              {/* Refunds Pagination */}
              <div className="flex items-center justify-between pt-4 border-t border-surface-container">
                <button
                  type="button"
                  disabled={refundsPage <= 1 || actionBusy}
                  onClick={() => setRefundsPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-on-surface-variant">Refunds Page {refundsPage}</span>
                <button
                  type="button"
                  disabled={!refundsHasMore || actionBusy}
                  onClick={() => setRefundsPage((p) => p + 1)}
                  className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ACCESSIBLE CONFIRMATION MODAL */}
        {confirmDialog && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-surface-container-highest">
              <h3 className="font-headline-md font-bold text-primary">{confirmDialog.title}</h3>
              <p className="font-body-sm text-on-surface-variant leading-relaxed">
                {confirmDialog.description}
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 border rounded-lg text-xs font-medium hover:bg-surface-container disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => confirmDialog.onConfirm()}
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-medium hover:bg-primary-hover disabled:opacity-50"
                >
                  {actionBusy ? "Processing..." : "Confirm & Commit"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
