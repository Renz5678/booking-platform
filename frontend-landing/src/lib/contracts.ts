export type AccountRole = "client" | "counselor" | "admin";

export interface Account {
  id: string;
  email: string;
  full_name: string;
  role: AccountRole;
  is_verified: boolean;
  google_calendar_connected?: boolean;
}

export interface PaymentRecord {
  id: string;
  booking_id: string;
  amount: number | string;
  currency?: string;
  status: "pending" | "review" | "paid" | "failed" | "refund_pending" | "refunded";
  payment_method?: string | null;
  provider?: string | null;
  paid_at?: string | null;
  transaction_reference?: string | null;
  review_deadline?: string | null;
  review_reason?: string | null;
  refund_reference?: string | null;
  refunded_at?: string | null;
}

export interface Intake {
  id?: string;
  concern_category: string;
  notes?: string;
  submitted_at?: string;
}

export interface BookingRecord {
  id: string;
  client_id: string;
  counselor_id: string;
  scheduled_start: string;
  scheduled_end: string;
  created_at: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "completed" | "no_show";
  client_name?: string;
  counselor_name?: string;
  provisioning_status: "pending" | "ready" | "failed";
  meeting_link?: string | null;
  payment?: PaymentRecord | null;
  intake_form?: Intake | null;
  gcash_number?: string;
  gcash_name?: string;
}

export interface PublicCounselor {
  id: string;
  bio?: string;
  photo_url?: string;
  specialization_tags: string[];
  user: { full_name: string };
}

export interface PaymentClaimItem {
  id: string;
  booking_id: string;
  reference: string;
  status: "open" | "allocated" | "rejected" | "duplicate" | "refund_pending" | "refunded";
  reason?: string | null;
  created_at: string;
  booking_status?: string | null;
  payment_status?: string | null;
  payment_amount?: string;
  eligible_for_allocation?: boolean;
}

export interface RefundObligationItem {
  id: string;
  booking_id?: string | null;
  reference: string;
  amount: string;
  source: string;
  status: string;
  created_at: string;
}

export interface ClientPaymentState {
  state: "awaiting_submission" | "under_review" | "reconciliation" | "rejected" | "expired" | "paid" | "refund_pending" | "refunded";
  amount: string;
  submission_deadline: string;
  review_deadline?: string | null;
  provisioning_status: "pending" | "ready" | "failed";
  meeting_ready: boolean;
  claims: Array<{ id: string; reference: string; status: string; created_at: string }>;
  refund?: { status: string; amount: string; completed_at?: string | null } | null;
}

export interface ClaimsQueueResponse {
  items: PaymentClaimItem[];
  page: number;
  has_more: boolean;
}

export interface RefundsQueueResponse {
  items: RefundObligationItem[];
  page: number;
  has_more: boolean;
}

export interface OperationsHealth {
  jobs: Record<string, number>;
  oldest_pending_at?: string | null;
  overdue_reviews: number;
  open_claims: number;
  refund_obligations: number;
  worker_healthy: boolean;
}

export interface DeliveryItem {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  error_code?: string | null;
  created_at: string;
  next_attempt_at?: string | null;
}

export interface ContactItem {
  id: string;
  name: string;
  email: string;
  message: string;
  resolved: boolean;
  created_at: string;
}
