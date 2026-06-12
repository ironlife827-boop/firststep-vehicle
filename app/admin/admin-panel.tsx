"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { DAYS, formatTime, TYPE_LABEL } from "@/lib/schedule";
import type { ExceptionType, ScheduleException, ScheduleType, Student, WeeklySchedule } from "@/lib/types";

const SCHEDULE_TYPES: { value: ScheduleType; label: string }[] = [
  { value: "PICKUP", label: "픽업" },
  { value: "DROP", label: "드랍" },
  { value: "MOVE", label: "이동" },
];

const EXCEPTION_TYPES: { value: ExceptionType; label: string }[] = [
  { value: "CHANGE", label: "변경" },
  { value: "CANCEL", label: "취소" },
  { value: "ADD", label: "추가" },
];

export function AdminPanel() {
  const [students, setStudents] = useState<Student[]>([]);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [studentName, setStudentName] = useState("");
  const [studentMemo, setStudentMemo] = useState("");
  const [scheduleStudentId, setScheduleStudentId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [runTime, setRunTime] = useState("15:20");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("PICKUP");
  const [location, setLocation] = useState("");
  const [exceptionType, setExceptionType] = useState<ExceptionType>("ADD");
  const [exceptionStudentId, setExceptionStudentId] = useState("");
  const [exceptionWeeklyId, setExceptionWeeklyId] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionTime, setExceptionTime] = useState("15:20");
  const [exceptionScheduleType, setExceptionScheduleType] = useState<ScheduleType>("PICKUP");
  const [exceptionLocation, setExceptionLocation] = useState("");
  const [exceptionMemo, setExceptionMemo] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeStudents = useMemo(() => students.filter((student) => student.is_active), [students]);

  useEffect(() => {
    void loadAdminData();
  }, []);

  async function loadAdminData() {
    const supabase = getSupabase();
    const [studentsResult, weeklyResult, exceptionsResult] = await Promise.all([
      supabase.from("students").select("id, name, memo, is_active").order("name"),
      supabase
        .from("weekly_schedules")
        .select("id, student_id, day_of_week, run_time, schedule_type, location, is_active, students(id, name, memo, is_active)")
        .order("day_of_week")
        .order("run_time"),
      supabase
        .from("schedule_exceptions")
        .select("id, student_id, weekly_schedule_id, target_date, run_time, schedule_type, location, exception_type, memo, students(id, name, memo, is_active)")
        .gte("target_date", new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10))
        .order("target_date", { ascending: false }),
    ]);

    if (studentsResult.error || weeklyResult.error || exceptionsResult.error) {
      setMessage(
        studentsResult.error?.message ??
          weeklyResult.error?.message ??
          exceptionsResult.error?.message ??
          "관리자 데이터를 불러오지 못했습니다.",
      );
      return;
    }

    setStudents((studentsResult.data ?? []) as Student[]);
    setWeeklySchedules((weeklyResult.data ?? []) as unknown as WeeklySchedule[]);
    setExceptions((exceptionsResult.data ?? []) as unknown as ScheduleException[]);
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentName.trim()) {
      return;
    }

    setIsSaving(true);
    const { error } = await getSupabase().from("students").insert({
      name: studentName.trim(),
      memo: studentMemo.trim() || null,
      is_active: true,
    });

    setIsSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setStudentName("");
    setStudentMemo("");
    setMessage("학생을 등록했습니다.");
    void loadAdminData();
  }

  async function addWeeklySchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location.trim() || !runTime) {
      return;
    }

    if (scheduleType !== "MOVE" && !scheduleStudentId) {
      setMessage("픽업/드랍은 학생을 선택해야 합니다.");
      return;
    }

    setIsSaving(true);
    const { error } = await getSupabase().from("weekly_schedules").insert({
      student_id: scheduleType === "MOVE" ? null : scheduleStudentId,
      day_of_week: dayOfWeek,
      run_time: runTime,
      schedule_type: scheduleType,
      location: location.trim(),
      is_active: true,
    });

    setIsSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setLocation("");
    setMessage("반복 스케줄을 등록했습니다.");
    void loadAdminData();
  }

  async function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exceptionDate) {
      return;
    }

    const payload = {
      student_id: exceptionScheduleType === "MOVE" ? null : exceptionStudentId || null,
      weekly_schedule_id: exceptionWeeklyId || null,
      target_date: exceptionDate,
      run_time: exceptionType === "CANCEL" ? null : exceptionTime,
      schedule_type: exceptionType === "CANCEL" ? null : exceptionScheduleType,
      location: exceptionType === "CANCEL" ? null : exceptionLocation.trim(),
      exception_type: exceptionType,
      memo: exceptionMemo.trim() || null,
    };

    if (exceptionType !== "CANCEL" && !payload.location) {
      setMessage("변경/추가 일정은 위치가 필요합니다.");
      return;
    }

    if (exceptionType !== "CANCEL" && exceptionScheduleType !== "MOVE" && !payload.student_id) {
      setMessage("변경/추가 픽업/드랍은 학생을 선택해야 합니다.");
      return;
    }

    setIsSaving(true);
    const { error } = await getSupabase().from("schedule_exceptions").insert(payload);
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setExceptionLocation("");
    setExceptionMemo("");
    setMessage("예외 일정을 등록했습니다.");
    void loadAdminData();
  }

  async function updateWeeklySchedule(schedule: WeeklySchedule, changes: Partial<WeeklySchedule>) {
    const nextType = changes.schedule_type ?? schedule.schedule_type;
    const nextStudentId = nextType === "MOVE" ? null : changes.student_id ?? schedule.student_id;

    const { error } = await getSupabase()
      .from("weekly_schedules")
      .update({
        ...changes,
        student_id: nextStudentId,
      })
      .eq("id", schedule.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    void loadAdminData();
  }

  async function deleteWeeklySchedule(id: string) {
    const { error } = await getSupabase().from("weekly_schedules").delete().eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    void loadAdminData();
  }

  async function deleteException(id: string) {
    const { error } = await getSupabase().from("schedule_exceptions").delete().eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    void loadAdminData();
  }

  return (
    <main className="min-h-screen bg-emerald-50 text-stone-950">
      <div className="mx-auto w-full max-w-[430px] bg-white pb-12 shadow-sm">
        <header className="bg-emerald-700 px-5 py-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-100">관리자</p>
              <h1 className="text-xl font-black">첫단추 차량시스템</h1>
            </div>
            <Link href="/" className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-emerald-800">
              메인
            </Link>
          </div>
        </header>

        <div className="space-y-5 px-4 py-4">
          {message ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              {message}
            </div>
          ) : null}

          <Panel title="학생 등록">
            <form onSubmit={addStudent} className="space-y-3">
              <Input value={studentName} onChange={setStudentName} placeholder="학생 이름" />
              <Input value={studentMemo} onChange={setStudentMemo} placeholder="메모" />
              <SubmitButton disabled={isSaving}>학생 등록</SubmitButton>
            </form>
          </Panel>

          <Panel title="반복 스케줄 등록">
            <form onSubmit={addWeeklySchedule} className="space-y-3">
              <Select value={scheduleType} onChange={(value) => setScheduleType(value as ScheduleType)}>
                {SCHEDULE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
              {scheduleType !== "MOVE" ? (
                <Select value={scheduleStudentId} onChange={setScheduleStudentId}>
                  <option value="">학생 선택</option>
                  {activeStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Select value={`${dayOfWeek}`} onChange={(value) => setDayOfWeek(Number(value))}>
                  {DAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}요일
                    </option>
                  ))}
                </Select>
                <Input type="time" value={runTime} onChange={setRunTime} placeholder="시간" />
              </div>
              <Input value={location} onChange={setLocation} placeholder="위치" />
              <SubmitButton disabled={isSaving}>스케줄 등록</SubmitButton>
            </form>
          </Panel>

          <Panel title="이번 주 예외 등록">
            <form onSubmit={addException} className="space-y-3">
              <Select value={exceptionType} onChange={(value) => setExceptionType(value as ExceptionType)}>
                {EXCEPTION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
              <Input type="date" value={exceptionDate} onChange={setExceptionDate} placeholder="날짜" />
              <Select value={exceptionWeeklyId} onChange={setExceptionWeeklyId}>
                <option value="">기본 일정 연결 없음</option>
                {weeklySchedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {DAYS.find((day) => day.value === schedule.day_of_week)?.label} {formatTime(schedule.run_time)}{" "}
                    {TYPE_LABEL[schedule.schedule_type]} {schedule.students?.name ?? "이동"}
                  </option>
                ))}
              </Select>
              {exceptionType !== "CANCEL" ? (
                <>
                  <Select
                    value={exceptionScheduleType}
                    onChange={(value) => setExceptionScheduleType(value as ScheduleType)}
                  >
                    {SCHEDULE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                  {exceptionScheduleType !== "MOVE" ? (
                    <Select value={exceptionStudentId} onChange={setExceptionStudentId}>
                      <option value="">학생 선택</option>
                      {activeStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="time" value={exceptionTime} onChange={setExceptionTime} placeholder="시간" />
                    <Input value={exceptionLocation} onChange={setExceptionLocation} placeholder="위치" />
                  </div>
                </>
              ) : null}
              <Input value={exceptionMemo} onChange={setExceptionMemo} placeholder="메모" />
              <SubmitButton disabled={isSaving}>예외 등록</SubmitButton>
            </form>
          </Panel>

          <Panel title="반복 스케줄 관리">
            <div className="space-y-3">
              {weeklySchedules.length === 0 ? (
                <p className="text-sm font-medium text-stone-500">등록된 반복 스케줄이 없습니다.</p>
              ) : (
                weeklySchedules.map((schedule) => (
                  <div key={schedule.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <div className="mb-3 text-sm font-black text-stone-900">
                      {DAYS.find((day) => day.value === schedule.day_of_week)?.label} {formatTime(schedule.run_time)} ·{" "}
                      {TYPE_LABEL[schedule.schedule_type]} · {schedule.students?.name ?? "이동"}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="time"
                        value={formatTime(schedule.run_time)}
                        onChange={(value) => updateWeeklySchedule(schedule, { run_time: value })}
                        placeholder="시간"
                      />
                      <Select
                        value={`${schedule.day_of_week}`}
                        onChange={(value) => updateWeeklySchedule(schedule, { day_of_week: Number(value) })}
                      >
                        {DAYS.map((day) => (
                          <option key={day.value} value={day.value}>
                            {day.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Select
                        value={schedule.schedule_type}
                        onChange={(value) => updateWeeklySchedule(schedule, { schedule_type: value as ScheduleType })}
                      >
                        {SCHEDULE_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() => updateWeeklySchedule(schedule, { is_active: !schedule.is_active })}
                        className={`h-11 rounded-lg text-sm font-bold ${
                          schedule.is_active ? "bg-emerald-700 text-white" : "bg-stone-200 text-stone-600"
                        }`}
                      >
                        {schedule.is_active ? "활성" : "비활성"}
                      </button>
                    </div>
                    <div className="mt-2">
                      <Input
                        value={schedule.location}
                        onChange={(value) => updateWeeklySchedule(schedule, { location: value })}
                        placeholder="위치"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteWeeklySchedule(schedule.id)}
                      className="mt-2 h-10 w-full rounded-lg bg-red-50 text-sm font-bold text-red-700"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="예외 일정 관리">
            <div className="space-y-2">
              {exceptions.length === 0 ? (
                <p className="text-sm font-medium text-stone-500">최근 예외 일정이 없습니다.</p>
              ) : (
                exceptions.map((item) => (
                  <div key={item.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <div className="text-sm font-black text-stone-900">
                      {item.target_date} · {EXCEPTION_TYPES.find((type) => type.value === item.exception_type)?.label}
                    </div>
                    <p className="mt-1 text-sm font-medium text-stone-600">
                      {item.run_time ? `${formatTime(item.run_time)} · ` : ""}
                      {item.schedule_type ? `${TYPE_LABEL[item.schedule_type]} · ` : ""}
                      {item.students?.name ?? (item.schedule_type === "MOVE" ? "이동" : "학생 없음")}
                      {item.location ? ` · ${item.location}` : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => deleteException(item.id)}
                      className="mt-2 h-10 w-full rounded-lg bg-red-50 text-sm font-bold text-red-700"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-black text-emerald-900">{title}</h2>
      {children}
    </section>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
    />
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
    >
      {children}
    </select>
  );
}

function SubmitButton({ disabled, children }: { disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-11 w-full rounded-lg bg-emerald-700 text-sm font-black text-white disabled:bg-stone-300"
    >
      {children}
    </button>
  );
}
