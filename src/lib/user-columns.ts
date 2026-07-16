// Non-sensitive public.users columns for AUTHENTICATED/anon-client reads.
//
// After the DB lock (REVOKE SELECT ON public.users FROM authenticated +
// GRANT SELECT (<these cols>)), the `authenticated` role can no longer read
// the 5 sensitive columns: base_salary, hourly_rate, pt_commission_rate,
// solo_rate, calendar_token. Any authenticated `select("*")` on users would
// then 500. So every browser/SSR (createClient) read of users MUST use this
// explicit list. Service-role reads (createAdminClient) may keep select("*").
export const USER_SELECT =
  "id, email, full_name, phone, role, avatar_url, emergency_contact_name, emergency_contact_phone, is_active, created_at, updated_at, push_token, is_first_login, nric_last4, citizenship_status, employment_type, certifications, start_date, status, buddy_rate, house_call_rate, emergency_contact_relationship, telegram_chat_id, pt_pay_per_class, pt_default_price_per_class, merged_into_id";
