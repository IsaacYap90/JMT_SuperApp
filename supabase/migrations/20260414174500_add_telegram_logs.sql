-- Telegram delivery audit log so cron + alert failures stop disappearing into Vercel console-only.
create table if not exists public.telegram_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.users(id) on delete set null,
  chat_id text,
  source text not null,
  ok boolean not null,
  http_status int,
  error text,
  payload_preview text,
  created_at timestamptz not null default now()
);

create index if not exists telegram_logs_created_at_idx on public.telegram_logs (created_at desc);
create index if not exists telegram_logs_source_ok_idx on public.telegram_logs (source, ok, created_at desc);
create index if not exists telegram_logs_recipient_idx on public.telegram_logs (recipient_user_id, created_at desc);
