delete from public.weekly_schedules
where schedule_type = 'DROP_START'
  and student_id is null;

alter table public.weekly_schedules
  drop constraint if exists move_student_rule;

alter table public.weekly_schedules
  add constraint move_student_rule
  check (
    (schedule_type = 'MOVE' and student_id is null)
    or (schedule_type in ('PICKUP', 'DROP', 'DROP_START') and student_id is not null)
    or (schedule_type = 'DROP' and student_id is null and location = '첫단추영어학원')
  );
