export type ScheduleType = "PICKUP" | "DROP" | "DROP_START" | "MOVE";
export type ExceptionType = "CHANGE" | "CANCEL" | "ADD";

export type Student = {
  id: string;
  name: string;
  memo: string | null;
  is_active: boolean;
};

export type WeeklySchedule = {
  id: string;
  student_id: string | null;
  day_of_week: number;
  run_time: string;
  schedule_type: ScheduleType;
  location: string;
  is_active: boolean;
  students?: Pick<Student, "id" | "name" | "memo" | "is_active"> | null;
};

export type DailyScheduleStatus = {
  id: string;
  weekly_schedule_id: string | null;
  schedule_exception_id: string | null;
  target_date: string;
  student_id: string | null;
  is_done: boolean;
  done_at: string | null;
};

export type ScheduleException = {
  id: string;
  student_id: string | null;
  weekly_schedule_id: string | null;
  target_date: string;
  run_time: string | null;
  schedule_type: ScheduleType | null;
  location: string | null;
  exception_type: ExceptionType;
  memo: string | null;
  students?: Pick<Student, "id" | "name" | "memo" | "is_active"> | null;
};

export type ScheduleItem = {
  id: string;
  source: "weekly" | "exception";
  weekly_schedule_id: string | null;
  schedule_exception_id: string | null;
  student_id: string | null;
  student_name: string | null;
  run_time: string;
  schedule_type: ScheduleType;
  location: string;
  target_date: string;
  memo?: string | null;
};

export type ScheduleGroup = {
  key: string;
  run_time: string;
  schedule_type: ScheduleType;
  location: string;
  items: ScheduleItem[];
};

export type ScheduleGroupOrder = {
  id?: string;
  day_of_week: number;
  run_time: string;
  schedule_type: ScheduleType;
  location: string;
  sort_order: number;
};
