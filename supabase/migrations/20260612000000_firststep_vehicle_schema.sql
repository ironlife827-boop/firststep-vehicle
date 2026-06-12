create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  memo text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 5),
  run_time time not null,
  schedule_type text not null check (schedule_type in ('PICKUP', 'DROP', 'MOVE')),
  location text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint move_student_rule check (
    (schedule_type = 'MOVE' and student_id is null)
    or (schedule_type in ('PICKUP', 'DROP') and student_id is not null)
  )
);

create table if not exists public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade,
  weekly_schedule_id uuid references public.weekly_schedules(id) on delete set null,
  target_date date not null,
  run_time time,
  schedule_type text check (schedule_type in ('PICKUP', 'DROP', 'MOVE')),
  location text,
  exception_type text not null check (exception_type in ('CHANGE', 'CANCEL', 'ADD')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exception_required_fields check (
    exception_type = 'CANCEL'
    or (run_time is not null and schedule_type is not null and location is not null)
  ),
  constraint exception_move_student_rule check (
    (schedule_type = 'MOVE' and student_id is null)
    or (schedule_type is distinct from 'MOVE')
  )
);

create table if not exists public.daily_schedule_status (
  id uuid primary key default gen_random_uuid(),
  weekly_schedule_id uuid references public.weekly_schedules(id) on delete cascade,
  schedule_exception_id uuid references public.schedule_exceptions(id) on delete cascade,
  target_date date not null,
  student_id uuid references public.students(id) on delete cascade,
  is_done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint status_source_required check (
    weekly_schedule_id is not null
    or schedule_exception_id is not null
  )
);

create unique index if not exists daily_status_student_unique
  on public.daily_schedule_status (weekly_schedule_id, target_date, student_id)
  where weekly_schedule_id is not null and student_id is not null;

create unique index if not exists daily_status_move_unique
  on public.daily_schedule_status (weekly_schedule_id, target_date)
  where weekly_schedule_id is not null and student_id is null;

create unique index if not exists daily_status_exception_student_unique
  on public.daily_schedule_status (schedule_exception_id, target_date, student_id)
  where schedule_exception_id is not null and student_id is not null;

create unique index if not exists daily_status_exception_move_unique
  on public.daily_schedule_status (schedule_exception_id, target_date)
  where schedule_exception_id is not null and student_id is null;

create index if not exists students_active_name_idx
  on public.students (is_active, name);

create index if not exists weekly_schedules_day_time_idx
  on public.weekly_schedules (day_of_week, run_time, schedule_type, location)
  where is_active = true;

create index if not exists schedule_exceptions_date_idx
  on public.schedule_exceptions (target_date, exception_type);

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists weekly_schedules_set_updated_at on public.weekly_schedules;
create trigger weekly_schedules_set_updated_at
before update on public.weekly_schedules
for each row execute function public.set_updated_at();

drop trigger if exists daily_schedule_status_set_updated_at on public.daily_schedule_status;
create trigger daily_schedule_status_set_updated_at
before update on public.daily_schedule_status
for each row execute function public.set_updated_at();

drop trigger if exists schedule_exceptions_set_updated_at on public.schedule_exceptions;
create trigger schedule_exceptions_set_updated_at
before update on public.schedule_exceptions
for each row execute function public.set_updated_at();

alter table public.students enable row level security;
alter table public.weekly_schedules enable row level security;
alter table public.daily_schedule_status enable row level security;
alter table public.schedule_exceptions enable row level security;

drop policy if exists "internal read students" on public.students;
create policy "internal read students"
on public.students for select
to anon
using (true);

drop policy if exists "internal write students" on public.students;
create policy "internal write students"
on public.students for all
to anon
using (true)
with check (true);

drop policy if exists "internal read weekly schedules" on public.weekly_schedules;
create policy "internal read weekly schedules"
on public.weekly_schedules for select
to anon
using (true);

drop policy if exists "internal write weekly schedules" on public.weekly_schedules;
create policy "internal write weekly schedules"
on public.weekly_schedules for all
to anon
using (true)
with check (true);

drop policy if exists "internal read daily status" on public.daily_schedule_status;
create policy "internal read daily status"
on public.daily_schedule_status for select
to anon
using (true);

drop policy if exists "internal write daily status" on public.daily_schedule_status;
create policy "internal write daily status"
on public.daily_schedule_status for all
to anon
using (true)
with check (true);

drop policy if exists "internal read exceptions" on public.schedule_exceptions;
create policy "internal read exceptions"
on public.schedule_exceptions for select
to anon
using (true);

drop policy if exists "internal write exceptions" on public.schedule_exceptions;
create policy "internal write exceptions"
on public.schedule_exceptions for all
to anon
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.daily_schedule_status;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.weekly_schedules;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.schedule_exceptions;
exception
  when duplicate_object then null;
end $$;
