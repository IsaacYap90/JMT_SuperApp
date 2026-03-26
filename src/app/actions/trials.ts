"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/types/database";
import { revalidatePath } from "next/cache";

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
