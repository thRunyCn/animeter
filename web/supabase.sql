-- Animeter voting table. Paste into Supabase: SQL Editor → New query → Run.
-- One row per visitor per series. Everyone can read; each visitor can only write their own rows.
create table if not exists public.reports (
  uid     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series  text not null check (char_length(series) between 1 and 40),
  clicked text check (clicked is null or clicked = 'never' or clicked ~ '^[0-9]{1,4}$'),
  stopped text check (stopped is null or stopped = 'no'    or stopped ~ '^[0-9]{1,4}$'),
  rating  smallint check (rating between 1 and 10),
  at      timestamptz not null default now(),
  primary key (uid, series)
);
alter table public.reports enable row level security;

drop policy if exists "reports readable by everyone" on public.reports;
drop policy if exists "visitors insert their own"    on public.reports;
drop policy if exists "visitors update their own"    on public.reports;
drop policy if exists "visitors delete their own"    on public.reports;

create policy "reports readable by everyone" on public.reports for select using (true);
create policy "visitors insert their own" on public.reports for insert to authenticated with check (auth.uid() = uid);
create policy "visitors update their own" on public.reports for update to authenticated using (auth.uid() = uid) with check (auth.uid() = uid);
create policy "visitors delete their own" on public.reports for delete to authenticated using (auth.uid() = uid);

-- Make sure the Data API roles can use the table (safe to run more than once).
grant usage on schema public to anon, authenticated;
grant select on public.reports to anon, authenticated;
grant insert, update, delete on public.reports to authenticated;

-- Personal lists: watching / completed / planned / dropped (safe to run more than once).
alter table public.reports add column if not exists status text
  check (status is null or status in ('watching', 'completed', 'planned', 'dropped'));
