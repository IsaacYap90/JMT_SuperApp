// Singapore Public Holidays from MOM (Ministry of Manpower)
// Source: https://www.mom.gov.sg/employment-practices/public-holidays

export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

const SG_HOLIDAYS: PublicHoliday[] = [
  // 2025
  { date: "2025-01-01", name: "New Year's Day" },
  { date: "2025-01-29", name: "Chinese New Year" },
  { date: "2025-01-30", name: "Chinese New Year" },
  { date: "2025-03-31", name: "Hari Raya Puasa" },
  { date: "2025-04-18", name: "Good Friday" },
  { date: "2025-05-01", name: "Labour Day" },
  { date: "2025-05-12", name: "Vesak Day" },
  { date: "2025-06-07", name: "Hari Raya Haji" },
  { date: "2025-08-09", name: "National Day" },
  { date: "2025-10-20", name: "Deepavali" },
  { date: "2025-12-25", name: "Christmas Day" },
  // 2026
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-17", name: "Chinese New Year" },
  { date: "2026-02-18", name: "Chinese New Year" },
  { date: "2026-03-21", name: "Hari Raya Puasa" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-01", name: "Labour Day" },
  { date: "2026-05-27", name: "Hari Raya Haji" },
  { date: "2026-05-31", name: "Vesak Day" },
  { date: "2026-08-09", name: "National Day" },
  { date: "2026-11-08", name: "Deepavali" },
  { date: "2026-12-25", name: "Christmas Day" },
];

export function isPublicHoliday(dateStr: string): PublicHoliday | null {
  return SG_HOLIDAYS.find((h) => h.date === dateStr) || null;
}

export function getTodayHoliday(): PublicHoliday | null {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
  return isPublicHoliday(today);
}

export function getWeekHolidays(startDate: string, endDate: string): PublicHoliday[] {
  return SG_HOLIDAYS.filter((h) => h.date >= startDate && h.date <= endDate);
}

export function getHolidaysByDayOfWeek(weekDates: Record<string, string>): Record<string, PublicHoliday | null> {
  // weekDates maps day_of_week -> "YYYY-MM-DD"
  const result: Record<string, PublicHoliday | null> = {};
  for (const [day, dateStr] of Object.entries(weekDates)) {
    result[day] = isPublicHoliday(dateStr) || null;
  }
  return result;
}

export { SG_HOLIDAYS };
