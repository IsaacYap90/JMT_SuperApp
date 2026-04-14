"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/types/database";
import { revalidatePath } from "next/cache";
import { createNotification } from "./notifications";

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !isAdmin(profile.role as "admin" | "master_admin" | "coach" | "member"))
    throw new Error("Not authorized");
}

export async function updateTrialSetting(
  classId: string,
  isEnabled: boolean,
  maxSpots: number
) {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("trial_settings")
    .select("id")
    .eq("class_id", classId)
    .single();

  if (existing) {
    await admin
      .from("trial_settings")
      .update({
        is_trial_enabled: isEnabled,
        max_trial_spots: maxSpots,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("trial_settings").insert({
      class_id: classId,
      is_trial_enabled: isEnabled,
      max_trial_spots: maxSpots,
    });
  }

  revalidatePath("/trial-settings");
}

export async function updateTrialSettingBatch(
  classIds: string[],
  isEnabled: boolean,
  maxSpots: number
) {
  await requireAdmin();
  const admin = createAdminClient();

  for (const classId of classIds) {
    const { data: existing } = await admin
      .from("trial_settings")
      .select("id")
      .eq("class_id", classId)
      .single();

    if (existing) {
      await admin
        .from("trial_settings")
        .update({
          is_trial_enabled: isEnabled,
          max_trial_spots: maxSpots,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await admin.from("trial_settings").insert({
        class_id: classId,
        is_trial_enabled: isEnabled,
        max_trial_spots: maxSpots,
      });
    }
  }

  revalidatePath("/trial-settings");
}

export async function createTrialBooking(data: {
  name: string;
  phone: string;
  programme: string;
  classId: string;
  bookingDate: string;
  timeSlot: string;
}) {
  const admin = createAdminClient();

  // Check spot availability
  const { data: setting } = await admin
    .from("trial_settings")
    .select("max_trial_spots")
    .eq("class_id", data.classId)
    .eq("is_trial_enabled", true)
    .single();

  if (!setting) throw new Error("This class is not available for trials");

  const { count } = await admin
    .from("trial_bookings")
    .select("id", { count: "exact", head: true })
    .eq("class_id", data.classId)
    .eq("booking_date", data.bookingDate)
    .eq("status", "booked");

  if ((count || 0) >= setting.max_trial_spots) {
    throw new Error("No spots available for this date");
  }

  const { data: booking, error } = await admin
    .from("trial_bookings")
    .insert({
      name: data.name,
      phone: data.phone,
      programme: data.programme,
      class_id: data.classId,
      booking_date: data.bookingDate,
      time_slot: data.timeSlot,
      status: "booked",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return booking;
}

// Admin-triggered manual trial booking. Fires alerts to all admins + the
// coaches assigned to the class (lead, assistant, class_coaches).
export async function adminCreateTrialBooking(data: {
  name: string;
  phone: string;
  programme: string;
  classId: string;
  bookingDate: string;
  timeSlot: string;
}) {
  await requireAdmin();
  const admin = createAdminClient();

  // Reuse the availability + insert logic
  const booking = await createTrialBooking(data);

  // Fetch class info + all coaches tied to it
  const { data: cls } = await admin
    .from("classes")
    .select(
      "name, lead_coach_id, assistant_coach_id, class_coaches(coach_id)"
    )
    .eq("id", data.classId)
    .single();

  // Collect unique recipient ids
  const coachIds = new Set<string>();
  if (cls?.lead_coach_id) coachIds.add(cls.lead_coach_id);
  if (cls?.assistant_coach_id) coachIds.add(cls.assistant_coach_id);
  if (Array.isArray(cls?.class_coaches)) {
    for (const cc of cls.class_coaches as { coach_id: string }[]) {
      if (cc.coach_id) coachIds.add(cc.coach_id);
    }
  }

  const { data: admins } = await admin
    .from("users")
    .select("id")
    .in("role", ["admin", "master_admin"])
    .eq("is_active", true)
    .is("merged_into_id", null);
  const adminIds = new Set<string>((admins || []).map((u) => u.id));

  const recipients = new Set<string>();
  coachIds.forEach((id) => recipients.add(id));
  adminIds.forEach((id) => recipients.add(id));

  const className = cls?.name || "class";
  const prettyDate = new Date(data.bookingDate + "T00:00:00+08:00")
    .toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });

  const title = "New trial booking";
  const message = `${data.name} booked ${className} — ${prettyDate} ${data.timeSlot}. Phone: ${data.phone}`;

  const recipientList: string[] = [];
  recipients.forEach((id) => recipientList.push(id));
  await Promise.allSettled(
    recipientList.map((uid) => createNotification(uid, "system", title, message))
  );

  revalidatePath("/trial-management");
  return booking;
}

export async function updateTrialBookingStatus(
  bookingId: string,
  status: "showed" | "no_show" | "cancelled"
) {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("trial_bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) throw new Error(error.message);
  revalidatePath("/trial-management");
}
