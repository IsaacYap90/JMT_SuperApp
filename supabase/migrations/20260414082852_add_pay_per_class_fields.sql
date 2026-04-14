-- Pay-per-class PT clients (e.g. Timothy, Mathieu, Hazel — long-time
-- clients who pay Jeremy per class instead of buying a session package).
-- When pt_pay_per_class = true on the user, sessions can be scheduled
-- without a pt_packages row, and each completed session records the
-- amount received in pt_sessions.paid_amount.

alter table public.users
  add column if not exists pt_pay_per_class boolean not null default false,
  add column if not exists pt_default_price_per_class numeric(10, 2);

alter table public.pt_sessions
  add column if not exists paid_amount numeric(10, 2);
