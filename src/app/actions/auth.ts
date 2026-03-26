"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function changePassword(newPassword: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);

  const admin = createAdminClient();
  await admin
    .from("users")
    .update({ is_first_login: false })
    .eq("id", user.id);

  revalidatePath("/");
}

export async function updateEmail(newEmail: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    throw new Error("Please enter a valid email address");
  }

  // Update auth email
  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
    email: trimmed,
    email_confirm: true,
  });
  if (authErr) throw new Error(authErr.message);

  // Update public.users email
  const { error: dbErr } = await admin
    .from("users")
    .update({ email: trimmed })
    .eq("id", user.id);
  if (dbErr) throw new Error(dbErr.message);

  revalidatePath("/profile");
}

export async function updatePhone(newPhone: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ phone: newPhone.trim() || null })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
}
