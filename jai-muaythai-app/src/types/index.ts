export type UserRole = 'member' | 'coach' | 'admin' | 'master_admin';
export type EmploymentType = 'full_time' | 'part_time';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  is_active: boolean;
  created_at: string;

  // Employment fields (for coaches)
  employment_type?: EmploymentType | null;
  hourly_rate?: number | null;
  base_salary?: number | null;
  certifications?: string | null;
  start_date?: string | null;
  is_first_login?: boolean;
}

export interface Membership {
  id: string;
  user_id: string;
  membership_type_id: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'cancelled';
  auto_renew: boolean;
  price_paid: number;
}

export interface ClassSession {
  id: string;
  class_id: string;
  session_date: string;
  status: 'scheduled' | 'cancelled' | 'completed';
}

export interface Booking {
  id: string;
  user_id: string;
  class_session_id: string;
  status: 'confirmed' | 'cancelled' | 'attended' | 'no_show';
  booked_at: string;
}

export interface PTPackage {
  id: string;
  user_id: string;
  preferred_coach_id: string | null;
  total_sessions: number;
  sessions_used: number;
  expiry_date: string;
  status: 'active' | 'expired' | 'completed';
}

// PT Session Type
export type PTSessionType = 'solo_package' | 'solo_single' | 'buddy' | 'house_call';

// PT Session with verification fields
export interface PTSession {
  id: string;
  coach_id: string;
  member_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: 'scheduled' | 'attended' | 'completed' | 'cancelled';
  session_price: number;

  // Session type and commission
  session_type: PTSessionType;       // solo_package, solo_single, buddy, or house_call
  commission_amount: number | null;  // Actual commission for this session

  // Verification fields
  coach_verified: boolean;
  member_verified: boolean;
  verification_date: string | null;
  payment_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  payment_amount: number | null;
  package_id: string | null;

  // Cancellation fields
  cancelled_by: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;

  // Edit tracking fields
  edited_by: string | null;
  edited_at: string | null;
  edit_count: number;
  notes: string | null;

  // Joined data
  member_name?: string;
  member_email?: string;
  coach_name?: string;
  package_sessions_remaining?: number;
  buddy_members?: string[];  // Array of additional member names for buddy sessions
}

// PT Session with full member/coach info for Admin
export interface PTSessionWithDetails extends PTSession {
  member: {
    full_name: string;
    email: string;
  };
  coach: {
    full_name: string;
    email: string;
  };
  package?: {
    id: string;
    sessions_used: number;
    total_sessions: number;
  };
}

// Verification status type
export type VerificationStatus =
  | 'scheduled'           // Orange - Not yet verified
  | 'coach_verified'      // Yellow - Coach marked attended, waiting for member
  | 'both_verified'       // Green - Both verified, pending payment
  | 'payment_approved';   // Blue - Payment approved

// Weekly earnings breakdown
export interface WeeklyEarningsBreakdown {
  pendingVerification: number;   // Sessions coach verified, member not
  pendingPayment: number;        // Both verified, not yet approved
  paidThisWeek: number;          // Payment approved this week
  totalPending: number;
}

// PT Payment for Admin approval
export interface PTPaymentApproval {
  sessionId: string;
  sessionDate: string;
  coachId: string;
  coachName: string;
  memberId: string;
  memberName: string;
  sessionPrice: number;
  coachCommission: number;
  packageId: string | null;
  packageSessionsRemaining: number;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: 'booking' | 'reminder' | 'announcement' | 'leave' | 'payment' | 'system';
  is_read: boolean;
  created_at: string;
}

export interface PayslipDeduction {
  id: string;
  description: string;
  amount: number;
}

export interface PayslipWeeklyPT {
  week: number;
  amount: number;
}

export interface Payslip {
  id: string;
  user_id: string;
  month: number;           // 1-12
  year: number;
  employment_type: 'full_time' | 'part_time';

  // Earnings
  base_salary: number;          // For full-time
  class_earnings: number;       // For part-time (calculated)
  class_hours: number;          // Actual hours taught
  class_rate_per_hour: number;  // Hourly rate for part-time
  pt_commission: number;        // 50% of session prices
  pt_session_count: number;     // Number of PT sessions
  pt_weekly_breakdown: PayslipWeeklyPT[]; // Weekly PT breakdown

  // Bonus
  bonus: number;                // Bonus amount
  bonus_description: string;    // Bonus description (e.g., "Chinese New Year Bonus")

  gross_pay: number;

  // Deductions
  cpf_contribution: number;
  other_deductions: number;
  deduction_details: PayslipDeduction[];
  total_deductions: number;

  // Net Pay
  net_pay: number;

  // Status & Payment
  status: 'pending' | 'paid';
  payment_date: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface PayslipSummary {
  month: number;
  year: number;
  monthName: string;
  grossPay: number;
  netPay: number;
  status: 'pending' | 'paid';
  paymentDate: string | null;
}
