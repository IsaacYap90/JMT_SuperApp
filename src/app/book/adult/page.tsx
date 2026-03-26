import { createAdminClient } from "@/lib/supabase/admin";
import { BookingPageClient } from "@/components/booking-page-client";
import { isPublicHoliday } from "@/lib/sg-holidays";

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

export default async function BookAdultPage() {
  return <BookingPage programme="adult" label="Adult" />;
}

async function BookingPage({ programme, label }: { programme: string; label: string }) {
  const admin = createAdminClient();

  // Fetch trial-enabled classes for this programme
  const { data: settings } = await admin
    .from("trial_settings")
    .select("*, class:classes(*)")
    .eq("is_trial_enabled", true);

  const trialClasses = (settings || [])
    .filter((s: Record<string, unknown>) => {
      const cls = s.class as Record<string, unknown> | null;
      return cls && cls.is_active && cls.programme === programme;
    })
    .map((s: Record<string, unknown>) => ({
      setting: s,
      class: s.class as Record<string, unknown>,
    }));

  // Generate next 14 days
  const today = new Date();
  const slots: {
    classId: string;
    className: string;
    date: string;
    dateLabel: string;
    dayName: string;
    timeSlot: string;
    spotsLeft: number;
  }[] = [];

  // Get all bookings for the next 14 days to count spots
  const startDate = new Date(today);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);

  const classIds = trialClasses.map((tc) => tc.class.id as string);
  const bookingCounts: Record<string, number> = {};

  if (classIds.length > 0) {
    const { data: bookings } = await admin
      .from("trial_bookings")
      .select("class_id, booking_date")
      .in("class_id", classIds)
      .eq("status", "booked")
      .gte("booking_date", startDate.toISOString().split("T")[0])
      .lt("booking_date", endDate.toISOString().split("T")[0]);

    for (const b of bookings || []) {
      const key = `${b.class_id}_${b.booking_date}`;
      bookingCounts[key] = (bookingCounts[key] || 0) + 1;
    }
  }

  for (let i = 0; i < 14; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];

    // Skip today (can't book same day) and public holidays
    if (i === 0) continue;
    if (isPublicHoliday(dateStr)) continue;

    const dayOfWeek = date.getDay();

    for (const tc of trialClasses) {
      const cls = tc.class;
      const classDayNum = DAY_MAP[cls.day_of_week as string];
      if (classDayNum !== dayOfWeek) continue;

      const maxSpots = (tc.setting as Record<string, unknown>).max_trial_spots as number;
      const booked = bookingCounts[`${cls.id}_${dateStr}`] || 0;
      const spotsLeft = maxSpots - booked;
      if (spotsLeft <= 0) continue;

      const startTime = (cls.start_time as string).slice(0, 5);
      const endTime = (cls.end_time as string).slice(0, 5);

      slots.push({
        classId: cls.id as string,
        className: cls.name as string,
        date: dateStr,
        dateLabel: date.toLocaleDateString("en-SG", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
        dayName: date.toLocaleDateString("en-US", { weekday: "long" }),
        timeSlot: `${startTime} - ${endTime}`,
        spotsLeft,
      });
    }
  }

  return (
    <BookingPageClient programme={programme} programmeLabel={label} slots={slots} />
  );
}
