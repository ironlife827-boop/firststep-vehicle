create table if not exists public.schedule_group_orders (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 1 and 5),
  run_time time not null,
  schedule_type text not null check (schedule_type in ('PICKUP', 'DROP', 'DROP_START', 'MOVE')),
  location text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day_of_week, run_time, schedule_type, location)
);

drop trigger if exists schedule_group_orders_set_updated_at on public.schedule_group_orders;
create trigger schedule_group_orders_set_updated_at
before update on public.schedule_group_orders
for each row execute function public.set_updated_at();

alter table public.schedule_group_orders enable row level security;

drop policy if exists "internal read schedule group orders" on public.schedule_group_orders;
create policy "internal read schedule group orders"
on public.schedule_group_orders for select
to anon
using (true);

drop policy if exists "internal write schedule group orders" on public.schedule_group_orders;
create policy "internal write schedule group orders"
on public.schedule_group_orders for all
to anon
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.schedule_group_orders;
exception
  when duplicate_object then null;
end $$;
