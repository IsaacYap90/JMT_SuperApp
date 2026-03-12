import { Dimensions } from 'react-native';

export interface ClassItem {
  id: string;
  name: string;
  description: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  capacity: number;
  lead_coach_id: string;
  lead_coach?: {
    full_name: string;
  };
  enrolled_count?: number;
  assigned_coaches?: string[];
}

export interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  member_id: string;
  coach_id: string;
  member_name: string;
  coach_name: string;
  session_type: string;
  session_rate: number | null;
  commission_amount: number | null;
  coach_verified: boolean;
  member_verified: boolean;
  payment_approved: boolean;
  edited_by: string | null;
  edited_at: string | null;
  edit_count: number;
  notes: string | null;
}

export interface Member {
  id: string;
  full_name: string;
  email: string;
}

export interface Coach {
  id: string;
  full_name: string;
  email: string;
  employment_type: 'full_time' | 'part_time' | null;
}

export interface AssignedCoach {
  coach_id: string;
  full_name: string;
  order: number;
  is_lead?: boolean;
}

// PT Commission Rates (at 50% commission)
export const PT_RATES = {
  solo_package: { session_rate: 80, commission: 40 },
  solo_single: { session_rate: 80, commission: 40 },
  buddy: { session_rate: 120, commission: 60 },
  house_call: { session_rate: 140, commission: 70 },
};

// Session types with commission rates displayed
export const SESSION_TYPES = [
  { value: 'solo_package', label: 'Solo - S$40' },
  { value: 'buddy', label: 'Buddy - S$60' },
  { value: 'house_call', label: 'House Call - S$70' },
];

// Helper to get commission amount based on session type
export const getCommissionForSessionType = (sessionType: string): number => {
  return PT_RATES[sessionType as keyof typeof PT_RATES]?.commission || 40;
};

// Helper to get session rate based on session type
export const getSessionRateForType = (sessionType: string): number => {
  return PT_RATES[sessionType as keyof typeof PT_RATES]?.session_rate || 80;
};

export const DAY_COLUMN_WIDTH = 100;
export const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Calendar helper: get days grid for a month (Mon-start)
export const getCalendarDays = (month: Date): (Date | null)[] => {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const lastDay = new Date(year, m + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, m, d));
  return days;
};

// Format date string for display: "Fri, 7 Feb"
export const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${day} ${month}`;
};

// Get today's date string in YYYY-MM-DD
export const getTodayStr = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Class levels
export const CLASS_LEVELS = [
  'All-Levels',
  'Advanced',
  'Kids',
  'Pre-Teen',
  'Beginner',
  'Fundamental',
  'Pro Fighter',
];

// Days of week
export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

// Helper to get class level from name
export const getClassLevel = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('kids')) return 'Kids';
  if (lower.includes('pre-teen')) return 'Pre-Teen';
  if (lower.includes('beginner')) return 'Beginner';
  if (lower.includes('advanced')) return 'Advanced';
  if (lower.includes('pro fighter')) return 'Pro Fighter';
  return 'All Levels';
};
