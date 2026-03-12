import { Colors } from './Colors';

/** Email-to-color mapping for visual coach distinction across the app */
export const COACH_COLORS: Record<string, string> = {
  'jeremy@jmt.com': '#00BFFF',  // Jai Blue (the boss)
  'isaac@jmt.com': '#FFD700',   // Yellow/Gold
  'shafiq@jmt.com': '#9B59B6',  // Purple
  'sasi@jmt.com': '#2ECC71',    // Green
  'heng@jmt.com': '#FF8C00',    // Orange
  'larvin@jmt.com': '#FF69B4',  // Pink
};

/** Get coach color by email address. Falls back to Jai Blue. */
export const getCoachColorByEmail = (email: string): string => {
  if (!email) return Colors.jaiBlue;
  return COACH_COLORS[email.toLowerCase()] || Colors.jaiBlue;
};

/** Get coach color by coach ID, looking up email from coaches array. Falls back to Jai Blue. */
export const getCoachColor = (coachId: string, coaches: { id: string; email: string }[]): string => {
  const coach = coaches.find(c => c.id === coachId);
  if (!coach?.email) return Colors.jaiBlue;
  return COACH_COLORS[coach.email.toLowerCase()] || Colors.jaiBlue;
};
