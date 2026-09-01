-- jai_facts — the editable JAI fact sheet the WhatsApp bot reads at answer time
-- (src/lib/wa/jai-facts.ts). Written 2026-09-01 to put an already-live table
-- under version control: it was created by hand on the production DB on
-- 2026-08-27 and existed in no migration, so it was neither reviewable nor
-- recreatable from this repo.
--
-- Idempotent on purpose — safe to run against prod, where the table and row
-- already exist. It creates nothing that is there and overwrites no content.

create table if not exists public.jai_facts (
  key        text primary key,
  content    text not null,
  updated_at timestamptz not null default now()
);

-- The row's content is injected verbatim into the bot's system prompt, so write
-- access is prompt-injection access. Only the service role may touch it; anon
-- and authenticated get nothing. RLS is belt-and-braces: with no policy it fails
-- closed, so a future blanket "grant ... to anon" cannot silently open it.
-- Present on the hand-created prod table and not in the create above, so a
-- rebuilt environment would otherwise drift from prod. Unused by src/ today.
alter table public.jai_facts add column if not exists label text;

alter table public.jai_facts enable row level security;

revoke all on public.jai_facts from anon, authenticated;
grant select, insert, update, delete on public.jai_facts to service_role;

-- DELIBERATELY NO SEED. An earlier draft inserted a placeholder row when none
-- existed, which quietly defeated the whole point: on a fresh DB (local, a
-- preview branch, a restore) readJaiFacts() would return source="db" with a
-- 56-character fact sheet, the canary would report "facts from DB" and PASS,
-- and JAI would answer customers with the placeholder. An ABSENT row is the
-- correct empty state — getJaiFacts() falls back to the in-code JAI_FACTS and
-- says so loudly in the logs, which is exactly the behaviour we want.
