-- Soft-delete marker for merged duplicate client records.
-- When two client rows are merged, the "loser" row stays in the table but
-- points at the "winner" via merged_into_id. All lists of clients filter
-- `merged_into_id is null` so the loser disappears from normal views.
alter table public.users
  add column if not exists merged_into_id uuid references public.users(id) on delete set null;

create index if not exists users_merged_into_id_idx
  on public.users(merged_into_id)
  where merged_into_id is not null;
