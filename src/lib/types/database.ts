export type Role = "admin" | "master_admin" | "coach" | "member";

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  is_first_login: boolean;
  created_at: string;
}

export interface ClassCoach {
  id: string;
  class_id: string;
  coach_id: string;
  is_lead: boolean;
  created_at: string;
  // joined
  coach?: User;
}

export interface Class {
  id: string;
  name: string;
  description: string | null;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  capacity: number;
  lead_coach_id: string | null;
  assistant_coach_id: string | null;
  is_active: boolean;
  created_at: string;
  schedule_id: string | null;
  programme: Programme | null;
  // joined
  lead_coach?: User;
  assistant_coach?: User;
  class_coaches?: ClassCoach[];
}

export interface PtPackage {
  id: string;
  user_id: string;
  package_type_id: string | null;
  preferred_coach_id: string | null;
  total_sessions: number;
  sessions_used: number;
  price_paid: number | null;
  purchase_date: string | null;
  expiry_date: string | null;
  status: string;
  created_at: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  // joined
  member?: User;
  coach?: User;
}

export interface PtSession {
  id: string;
  package_id: string;
  coach_id: string;
  member_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  coach_notes: string | null;
  session_type: string | null;
  notes: string | null;
  created_at: string;
  // joined
  coach?: User;
  member?: User;
  package?: { guardian_name: string | null; guardian_phone: string | null } | null;
}

export interface ClassSession {
  id: string;
  class_id: string;
  session_date: string;
  status: string;
  cancellation_reason: string | null;
  created_at: string;
  // joined
  class?: Class;
}

export type LeaveType = "sick" | "annual" | "emergency" | "hospital" | "in_lieu";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface Leave {
  id: string;
  coach_id: string;
  leave_date: string;
  leave_end_date: string | null;
  leave_type: LeaveType;
  is_half_day: boolean;
  reason: string;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  // joined
  coach?: User;
  reviewer?: User;
}

export type ConfirmationStatus = "unsent" | "sent" | "replied";

export interface PtConfirmation {
  id: string;
  pt_session_id: string;
  status: ConfirmationStatus;
  week_start: string;
  updated_at: string;
  created_at: string;
}

export type EarningType = "salary" | "pt_weekly" | "bonus" | "other";

export interface Earning {
  id: string;
  coach_id: string;
  date: string;
  type: EarningType;
  amount: number;
  description: string | null;
  created_at: string;
}

export type Programme = "adult" | "kids" | "teens";

export interface TrialSetting {
  id: string;
  class_id: string;
  is_trial_enabled: boolean;
  max_trial_spots: number;
  created_at: string;
  updated_at: string;
}

export type TrialBookingStatus = "booked" | "showed" | "no_show" | "cancelled";

export interface TrialBooking {
  id: string;
  name: string;
  phone: string;
  programme: Programme;
  class_id: string;
  booking_date: string;
  time_slot: string;
  status: TrialBookingStatus;
  created_at: string;
  // joined
  class?: Class;
}

export type NotificationType = "class_assigned" | "pt_scheduled" | "class_cancelled" | "class_updated" | "system";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: NotificationType | string;
  is_read: boolean;
  created_at: string;
}

export function isAdmin(role: Role): boolean {
  return role === "admin" || role === "master_admin";
}
