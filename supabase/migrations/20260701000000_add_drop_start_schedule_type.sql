alter table public.weekly_schedules
  drop constraint if exists weekly_schedules_schedule_type_check;

alter table public.weekly_schedules
  add constraint weekly_schedules_schedule_type_check
  check (schedule_type in ('PICKUP', 'DROP', 'DROP_START', 'MOVE'));

alter table public.schedule_exceptions
  drop constraint if exists schedule_exceptions_schedule_type_check;

alter table public.schedule_exceptions
  add constraint schedule_exceptions_schedule_type_check
  check (schedule_type in ('PICKUP', 'DROP', 'DROP_START', 'MOVE'));

alter table public.weekly_schedules
  drop constraint if exists move_student_rule;

alter table public.weekly_schedules
  add constraint move_student_rule
  check (
    (schedule_type = 'MOVE' and student_id is null)
    or (schedule_type in ('PICKUP', 'DROP') and student_id is not null)
    or (schedule_type = 'DROP' and student_id is null and location = '첫단추영어학원')
    or (schedule_type = 'DROP_START' and student_id is null)
  );
