"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { api } from "@/lib/api";
import type { DeliveryItem, ContactItem, OperationsHealth } from "@/lib/contracts";

export default function Operations() {
  const [health, setHealth] = useState<OperationsHealth | null>(null);
  const [jobs, setJobs] = useState<DeliveryItem[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const [h, j, c] = await Promise.all([
        api.get<OperationsHealth>("/admin/operations/health").catch(() => null),
        api.get<{ items: DeliveryItem[]; has_more: boolean }>(`/admin/operations/deliveries?page=${page}`),
        api.get<{ items: ContactItem[]; has_more: boolean }>(`/admin/operations/contacts?page=${page}`),
      ]);
      if (h) setHealth(h);
      setJobs(j.items);
      setContacts(c.items);
      setMore(j.has_more || c.has_more);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (path: string, body?: unknown) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (body !== undefined) {
        await api.put(path, body);
      } else {
        await api.post(path);
      }
      setSuccess("Action completed successfully.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout role="admin">
      <div className="p-8 space-y-8">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/admin/payments" className="text-primary hover:underline">
            &larr; Payment Queue
          </Link>
          <span className="text-on-surface-variant">|</span>
          <Link href="/admin/reconciliation" className="text-primary hover:underline">
            Reconciliation &rarr;
          </Link>
        </nav>

        <div>
          <h1 className="text-2xl font-bold text-primary">System Operations &amp; Inboxes</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Monitor worker background health, retry failed delivery jobs, and manage client contact inquiries.
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

        {/* Operational Health Overview */}
        {health && (
          <section className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="font-bold text-lg text-primary flex items-center justify-between">
              <span>Operational Health</span>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  health.worker_healthy
                    ? "bg-secondary-container text-on-secondary-container"
                    : "bg-error-container text-on-error-container"
                }`}
              >
                {health.worker_healthy ? "● Worker Heartbeat Active" : "▲ Worker Heartbeat Inactive"}
              </span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-surface-container-low p-3 rounded-lg">
                <span className="text-on-surface-variant text-xs block">Open Claims</span>
                <span className="font-bold text-lg text-primary">{health.open_claims}</span>
              </div>
              <div className="bg-surface-container-low p-3 rounded-lg">
                <span className="text-on-surface-variant text-xs block">Refund Obligations</span>
                <span className="font-bold text-lg text-primary">{health.refund_obligations}</span>
              </div>
              <div className="bg-surface-container-low p-3 rounded-lg">
                <span className="text-on-surface-variant text-xs block">Overdue Reviews</span>
                <span className={`font-bold text-lg ${health.overdue_reviews > 0 ? "text-error" : "text-primary"}`}>
                  {health.overdue_reviews}
                </span>
              </div>
              <div className="bg-surface-container-low p-3 rounded-lg">
                <span className="text-on-surface-variant text-xs block">Active Delivery Jobs</span>
                <span className="font-bold text-lg text-primary">
                  {(health.jobs.pending || 0) + (health.jobs.processing || 0)}
                </span>
              </div>
            </div>
            {health.oldest_pending_at && (
              <p className="text-xs text-on-surface-variant">
                Oldest pending job: {new Date(health.oldest_pending_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)
              </p>
            )}
          </section>
        )}

        {/* Deliveries Queue */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg text-primary">Pending Delivery Jobs</h2>
            <button
              onClick={() => void load()}
              disabled={busy}
              className="border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-surface-container disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {!jobs.length ? (
            <p className="text-sm text-on-surface-variant border border-outline-variant rounded-xl p-4">
              All outbox delivery jobs are processed.
            </p>
          ) : (
            <div className="space-y-3">
              {jobs.map((j) => (
                <article
                  key={j.id}
                  className="border border-outline-variant rounded-xl p-4 bg-surface flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-sm shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-primary">{j.kind}</span>
                      <span className="bg-surface-container px-2 py-0.5 rounded text-xs font-semibold uppercase">
                        {j.status}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      Attempts: {j.attempts} {j.error_code ? `· Last Error: ${j.error_code}` : ""} · Queued:{" "}
                      {new Date(j.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                    </p>
                  </div>
                  {j.status === "failed" && (
                    <button
                      disabled={busy}
                      onClick={() => void mutate(`/admin/operations/deliveries/${j.id}/retry`)}
                      className="bg-primary text-on-primary rounded-lg px-3 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Queuing..." : "Retry Delivery"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Contact Messages */}
        <section className="space-y-4">
          <h2 className="font-bold text-lg text-primary">Contact Messages</h2>
          {!contacts.length ? (
            <p className="text-sm text-on-surface-variant border border-outline-variant rounded-xl p-4">
              No contact submissions in inbox.
            </p>
          ) : (
            <div className="space-y-3">
              {contacts.map((c) => (
                <article
                  key={c.id}
                  className="border border-outline-variant rounded-xl p-4 bg-surface space-y-2 text-sm shadow-sm"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <strong className="text-primary">{c.name}</strong> &lt;{c.email}&gt;
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        c.resolved
                          ? "bg-secondary-container text-on-secondary-container"
                          : "bg-surface-container-high text-on-surface"
                      }`}
                    >
                      {c.resolved ? "Resolved" : "Open"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap bg-surface-container-lowest p-3 rounded-lg border border-outline-variant text-on-surface">
                    {c.message}
                  </p>
                  <div className="flex justify-between items-center pt-1 text-xs text-on-surface-variant">
                    <span>Received: {new Date(c.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</span>
                    <button
                      disabled={busy}
                      onClick={() => void mutate(`/admin/operations/contacts/${c.id}`, { resolved: !c.resolved })}
                      className="border border-outline-variant rounded px-2.5 py-1 font-medium hover:bg-surface-container disabled:opacity-50"
                    >
                      {c.resolved ? "Reopen Message" : "Mark as Resolved"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Pagination */}
        <div className="flex items-center justify-center gap-3 text-sm pt-4">
          <button
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
            className="border border-outline-variant rounded-lg px-3 py-1.5 hover:bg-surface-container disabled:opacity-50"
          >
            Previous
          </button>
          <span className="font-medium text-on-surface-variant">Page {page}</span>
          <button
            disabled={!more || busy}
            onClick={() => setPage(page + 1)}
            className="border border-outline-variant rounded-lg px-3 py-1.5 hover:bg-surface-container disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
