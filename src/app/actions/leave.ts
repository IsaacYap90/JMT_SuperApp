"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function getAuthUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function cancelLeave(leaveId: string) {
  const userId = await getAuthUser();
  const admin = createAdminClient();

  // Verify the leave belongs to this user
  const { data: leave } = await admin
    .from("leaves")
    .select("coach_id, leave_date")
    .eq("id", leaveId)
    .single();

  if (!leave) throw new Error("Leave not found");
  if (leave.coach_id !== userId) throw new Error("Not authorized");

  const today = new Date().toISOString().split("T")[0];
  if (leave.leave_date < today) throw new Error("Cannot cancel past leaves");

  const { error } = await admin.from("leaves").delete().eq("id", leaveId);
  if (error) throw new Error(error.message);

  revalidatePath("/leave");
}
