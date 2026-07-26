export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "client" | "counselor" | "admin";
}

export interface CounselorProfile {
  id: string;
  bio: string | null;
  specialization_tags: string[];
  google_calendar_connected: boolean;
  user: {
    id: string;
    full_name: string;
  };
}

export interface Booking {
  id: string;
  client_id: string;
  counselor_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: "pending_payment" | "confirmed" | "completed" | "cancelled";
  meeting_link?: string;
  client?: {
    id: string;
    full_name: string;
  };
  counselor?: {
    id: string;
    user: {
      full_name: string;
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
