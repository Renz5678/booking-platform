export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "client" | "counselor" | "admin";
  is_verified?: boolean;
  google_calendar_connected?: boolean;
  is_active?: boolean;
}

export interface CounselorProfile {
  id: string;
  bio: string | null;
  photo_url?: string | null;
  specialization_tags: string[];
  google_calendar_connected?: boolean;
  is_verified?: boolean;
  is_active?: boolean;
  credentials_url?: string | null;
  gcash_number?: string | null;
  gcash_qr_url?: string | null;
  user: {
    id: string;
    full_name: string;
    email?: string;
  };
}

export interface IntakeFormInfo {
  id: string;
  concern_category: string;
  notes?: string | null;
  submitted_at: string;
}

export interface PaymentInfo {
  id: string;
  booking_id: string;
  amount: number;
  currency: string;
  provider: string;
  provider_payment_id?: string | null;
  proof_url?: string | null;
  status: "pending" | "paid" | "failed" | "refunded";
  payment_method?: "gcash" | "maya" | "card" | null;
  refund_status?: string | null;
  created_at: string;
  paid_at?: string | null;
}

export interface Booking {
  id: string;
  client_id: string;
  counselor_id: string;
  client_name?: string | null;
  counselor_name?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: "pending_payment" | "confirmed" | "completed" | "cancelled" | "no_show";
  meeting_link?: string | null;
  created_at?: string;
  intake_form?: IntakeFormInfo | null;
  payment?: PaymentInfo | null;
  client?: {
    id: string;
    full_name: string;
    email?: string;
  };
  counselor?: {
    id: string;
    gcash_number?: string | null;
    gcash_qr_url?: string | null;
    user?: {
      full_name: string;
      email?: string;
    };
  };
}

export interface AvailabilityBlock {
  id: string;
  counselor_id: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  day_of_week: number | null;
  specific_date: string | null;
}
