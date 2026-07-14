create table if not exists public.schedule_snapshots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists schedule_snapshots_set_updated_at on public.schedule_snapshots;
create trigger schedule_snapshots_set_updated_at
before update on public.schedule_snapshots
for each row execute function public.set_updated_at();

alter table public.schedule_snapshots enable row level security;

drop policy if exists "internal read schedule snapshots" on public.schedule_snapshots;
create policy "internal read schedule snapshots"
on public.schedule_snapshots for select
to anon
using (true);

drop policy if exists "internal write schedule snapshots" on public.schedule_snapshots;
create policy "internal write schedule snapshots"
on public.schedule_snapshots for all
to anon
using (true)
with check (true);
