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
  isMyClass?: boolean; // Flag to indicate if this coach is assigned to this class
  assignedCoaches?: Array<{
    coach_id: string;
    full_name: string;
    is_lead: boolean;
  }>;
  myRole?: 'lead' | 'assistant' | null;
}

export interface PTSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  member_name: string;
  session_type?: string;
  commission_amount?: number | null;
  coach_verified?: boolean;
}

// Unified timeline item
export interface TimelineItem {
  id: string;
  type: 'class' | 'pt';
  time: string;
  title: string;
  subtitle: string;
  details: string;
  isPassed: boolean;
  isAssistant?: boolean;
  sessionType?: string;
  commission?: number;
  data: ClassItem | PTSession;
}

export const DAY_COLUMN_WIDTH = 120;
export const { width: SCREEN_WIDTH } = Dimensions.get('window');
