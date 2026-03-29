import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const email = "iryanishafiq@gmail.com";
  const password = "Jmt123";
  const fullName = "Shafiq Nuri";
  const role = "coach";

  // Check if auth user exists
  const { data: users } = await admin.auth.admin.listUsers();
  const existing = users?.users.find((u) => u.email === email);

  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log(`Auth user already exists: ${userId}`);
    // Reset password to default
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
      password,
    });
    if (pwErr) {
      console.error("Password reset failed:", pwErr.message);
      process.exit(1);
    }
    console.log("Password reset to default");
  } else {
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr) {
      console.error("Auth user creation failed:", authErr.message);
      process.exit(1);
    }
    userId = authData.user.id;
    console.log(`Auth user created: ${userId}`);
  }

  // Check if users table row exists
  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .single();

  if (profile) {
    // Update existing row
    const { error: upErr } = await admin
      .from("users")
      .update({ full_name: fullName, role, is_active: true, is_first_login: true })
      .eq("id", userId);
    if (upErr) {
      console.error("Users table update failed:", upErr.message);
      process.exit(1);
    }
    console.log(`User profile updated: ${fullName} (${role}), is_first_login: true`);
  } else {
    // Insert new row
    const { error: dbErr } = await admin.from("users").insert({
      id: userId,
      email,
      full_name: fullName,
      role,
      is_active: true,
      is_first_login: true,
    });
    if (dbErr) {
      console.error("Users table insert failed:", dbErr.message);
      process.exit(1);
    }
    console.log(`User profile created: ${fullName} (${role}), is_first_login: true`);
  }

  console.log("Done! Shafiq will be prompted to change password on first login.");
}

main();
