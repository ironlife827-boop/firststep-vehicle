"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DAYS, formatTime, TYPE_LABEL } from "@/lib/schedule";
import { getSupabase } from "@/lib/supabase";
import type { ExceptionType, ScheduleException, ScheduleType, Student, WeeklySchedule } from "@/lib/types";

const SCHEDULE_TYPES: { value: Exclude<ScheduleType, "MOVE">; label: string }[] = [
  { value: "PICKUP", label: "픽업" },
  { value: "DROP", label: "드랍" },
];

const EXCEPTION_TYPES: { value: ExceptionType; label: string }[] = [
  { value: "ADD", label: "추가" },
  { value: "CHANGE", label: "변경" },
  { value: "CANCEL", label: "취소" },
];

export function AdminPanel() {
  const [students, setStudents] = useState<Student[]>([]);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [allExceptionLocations, setAllExceptionLocations] = useState<string[]>([]);
  const [studentName, setStudentName] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [showStudentList, setShowStudentList] = useState(false);
  const [scheduleStudentIds, setScheduleStudentIds] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);
  const [runTime, setRunTime] = useState("15:20");
  const [scheduleType, setScheduleType] = useState<Exclude<ScheduleType, "MOVE">>("PICKUP");
  const [location, setLocation] = useState("");
  const [exceptionType, setExceptionType] = useState<ExceptionType>("ADD");
  const [exceptionStudentId, setExceptionStudentId] = useState("");
  const [exceptionWeeklyId, setExceptionWeeklyId] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionTime, setExceptionTime] = useState("15:20");
  const [exceptionScheduleType, setExceptionScheduleType] = useState<Exclude<ScheduleType, "MOVE">>("PICKUP");
  const [exceptionLocation, setExceptionLocation] = useState("");
  const [exceptionMemo, setExceptionMemo] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [exceptionFilter, setExceptionFilter] = useState("");
  const [scheduleManageDay, setScheduleManageDay] = useState<number | null>(null);
  const [exceptionManageDay, setExceptionManageDay] = useState<number | null>(null);
  const [selectedLocationName, setSelectedLocationName] = useState("");
  const [nextLocationName, setNextLocationName] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeStudents = useMemo(
    () => students.filter((student) => student.is_active).sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [students],
  );

  const filteredStudents = useMemo(() => {
    const keyword = studentFilter.trim().toLocaleLowerCase("ko-KR");

    if (!keyword) {
      return activeStudents;
    }

    return activeStudents.filter((student) =>
      student.name.toLocaleLowerCase("ko-KR").includes(keyword),
    );
  }, [activeStudents, studentFilter]);

  const locations = useMemo(() => {
    const values = [
      ...weeklySchedules.map((item) => item.location),
      ...allExceptionLocations,
    ].filter((value): value is string => Boolean(value?.trim()));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "ko"));
  }, [allExceptionLocations, weeklySchedules]);

  const locationUsages = useMemo(() => {
    return locations.map((name) => ({
      name,
      weeklyCount: weeklySchedules.filter((schedule) => schedule.location === name).length,
      exceptionCount: allExceptionLocations.filter((locationName) => locationName === name).length,
    }));
  }, [allExceptionLocations, locations, weeklySchedules]);

  const filteredSchedules = useMemo(() => {
    const keyword = scheduleFilter.trim().toLocaleLowerCase("ko-KR");
    const schedules = weeklySchedules
      .filter((schedule) => schedule.schedule_type !== "MOVE")
      .filter((schedule) => scheduleManageDay === null || schedule.day_of_week === scheduleManageDay)
      .sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) {
          return a.day_of_week - b.day_of_week;
        }
        const timeCompare = formatTime(a.run_time).localeCompare(formatTime(b.run_time));
        if (timeCompare !== 0) {
          return timeCompare;
        }
        const locationCompare = a.location.localeCompare(b.location, "ko");
        if (locationCompare !== 0) {
          return locationCompare;
        }
        return (a.students?.name ?? "").localeCompare(b.students?.name ?? "", "ko");
      });

    if (!keyword) {
      return schedules;
    }

    return schedules.filter((schedule) =>
      [schedule.students?.name, schedule.location, TYPE_LABEL[schedule.schedule_type]]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("ko-KR").includes(keyword)),
    );
  }, [scheduleFilter, scheduleManageDay, weeklySchedules]);

  const filteredExceptions = useMemo(() => {
    const keyword = exceptionFilter.trim().toLocaleLowerCase("ko-KR");
    const sorted = [...exceptions]
      .filter((item) => exceptionManageDay === null || getKoreanWeekday(item.target_date) === exceptionManageDay)
      .sort((a, b) => {
        const dateCompare = b.target_date.localeCompare(a.target_date);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return (a.run_time ?? "99:99").localeCompare(b.run_time ?? "99:99");
      });

    if (!keyword) {
      return sorted;
    }

    return sorted.filter((item) =>
      [item.students?.name, item.location, item.memo, item.target_date]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("ko-KR").includes(keyword)),
    );
  }, [exceptionFilter, exceptionManageDay, exceptions]);

  useEffect(() => {
    void loadAdminData();
  }, []);

  function selectExceptionWeeklySchedule(scheduleId: string) {
    setExceptionWeeklyId(scheduleId);

    const selectedSchedule = weeklySchedules.find((schedule) => schedule.id === scheduleId);
    if (!selectedSchedule) {
      return;
    }

    setExceptionStudentId(selectedSchedule.student_id ?? "");
    setExceptionTime(formatTime(selectedSchedule.run_time));
    setExceptionScheduleType(selectedSchedule.schedule_type === "DROP" ? "DROP" : "PICKUP");
    setExceptionLocation(selectedSchedule.location);
  }

  async function loadAdminData() {
    const supabase = getSupabase();
    const [studentsResult, weeklyResult, exceptionsResult, allExceptionLocationsResult] = await Promise.all([
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
      supabase.from("schedule_exceptions").select("location"),
    ]);

    if (studentsResult.error || weeklyResult.error || exceptionsResult.error || allExceptionLocationsResult.error) {
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
    setAllExceptionLocations(
      (allExceptionLocationsResult.data ?? [])
        .map((item) => item.location)
        .filter((value): value is string => Boolean(value?.trim())),
    );
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = studentName.trim();

    if (!trimmedName) {
      return;
    }

    const hasSameName = students.some(
      (student) =>
        student.is_active &&
        student.name.trim().toLocaleLowerCase("ko-KR") === trimmedName.toLocaleLowerCase("ko-KR"),
    );

    if (
      hasSameName &&
      !window.confirm(`${trimmedName} 학생이 이미 있습니다. 그래도 새로 등록할까요?`)
    ) {
      return;
    }

    setIsSaving(true);
    const { error } = await getSupabase().from("students").insert({
      name: trimmedName,
      memo: null,
      is_active: true,
    });
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setStudentName("");
    setMessage("학생을 등록했습니다.");
    void loadAdminData();
  }

  async function deleteStudent(student: Student) {
    if (
      !window.confirm(
        `${student.name} 학생을 삭제할까요?\n등록된 반복 스케줄과 체크 기록도 함께 삭제될 수 있습니다.`,
      )
    ) {
      return;
    }

    const { error } = await getSupabase().from("students").delete().eq("id", student.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (scheduleStudentIds.includes(student.id)) {
      setScheduleStudentIds((current) => current.filter((id) => id !== student.id));
    }

    if (exceptionStudentId === student.id) {
      setExceptionStudentId("");
    }

    setMessage("학생을 삭제했습니다.");
    void loadAdminData();
  }

  async function addWeeklySchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (scheduleStudentIds.length === 0 || !location.trim() || !runTime || selectedDays.length === 0) {
      setMessage("학생, 요일, 시간, 위치를 모두 입력해 주세요.");
      return;
    }

    const normalizedLocation = location.trim();
    const duplicateSchedules = weeklySchedules.filter(
      (schedule) =>
        schedule.is_active &&
        scheduleStudentIds.includes(schedule.student_id ?? "") &&
        selectedDays.includes(schedule.day_of_week) &&
        formatTime(schedule.run_time) === runTime &&
        schedule.schedule_type === scheduleType &&
        schedule.location.trim().toLocaleLowerCase("ko-KR") === normalizedLocation.toLocaleLowerCase("ko-KR"),
    );

    if (duplicateSchedules.length > 0) {
      const duplicateNames = Array.from(
        new Set(duplicateSchedules.map((schedule) => schedule.students?.name).filter(Boolean)),
      ).join(", ");

      if (
        !window.confirm(
          `같은 반복 스케줄이 이미 ${duplicateSchedules.length}개 있습니다.\n${
            duplicateNames ? `학생: ${duplicateNames}\n` : ""
          }그래도 등록할까요?`,
        )
      ) {
        return;
      }
    }

    setIsSaving(true);
    const { error } = await getSupabase().from("weekly_schedules").insert(
      scheduleStudentIds.flatMap((studentId) =>
        selectedDays.map((day) => ({
          student_id: studentId,
          day_of_week: day,
          run_time: runTime,
          schedule_type: scheduleType,
          location: normalizedLocation,
          is_active: true,
        })),
      ),
    );
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setLocation("");
    setMessage(`${scheduleStudentIds.length}명, ${selectedDays.length}개 요일에 반복 스케줄을 등록했습니다.`);
    void loadAdminData();
  }

  async function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!exceptionDate) {
      setMessage("예외 날짜를 선택해 주세요.");
      return;
    }

    const payload = {
      student_id: exceptionType === "CANCEL" ? exceptionStudentId || null : exceptionStudentId || null,
      weekly_schedule_id: exceptionWeeklyId || null,
      target_date: exceptionDate,
      run_time: exceptionType === "CANCEL" ? null : exceptionTime,
      schedule_type: exceptionType === "CANCEL" ? null : exceptionScheduleType,
      location: exceptionType === "CANCEL" ? null : exceptionLocation.trim(),
      exception_type: exceptionType,
      memo: exceptionMemo.trim() || null,
    };

    if (exceptionType !== "CANCEL" && (!payload.student_id || !payload.location || !exceptionTime)) {
      setMessage("변경/추가 예외는 학생, 시간, 위치가 필요합니다.");
      return;
    }

    if (exceptionType === "CANCEL" && !payload.weekly_schedule_id && !payload.student_id) {
      setMessage("취소 예외는 기본 일정 또는 학생을 선택해 주세요.");
      return;
    }

    setIsSaving(true);
    const { error } = await getSupabase().from("schedule_exceptions").insert(payload);
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setExceptionMemo("");
    setMessage("예외 일정을 등록했습니다.");
    void loadAdminData();
  }

  async function updateLocationName() {
    const currentName = selectedLocationName.trim();
    const normalizedNextName = nextLocationName.trim();

    if (!currentName || !normalizedNextName) {
      setMessage("수정할 위치와 새 위치 이름을 모두 입력해 주세요.");
      return;
    }

    if (currentName === normalizedNextName) {
      setMessage("기존 위치 이름과 새 위치 이름이 같습니다.");
      return;
    }

    const alreadyExists = locations.some(
      (name) =>
        name !== currentName &&
        name.toLocaleLowerCase("ko-KR") === normalizedNextName.toLocaleLowerCase("ko-KR"),
    );

    if (
      alreadyExists &&
      !window.confirm(`${normalizedNextName} 위치가 이미 있습니다. 기존 위치와 합쳐서 변경할까요?`)
    ) {
      return;
    }

    const usage = locationUsages.find((item) => item.name === currentName);
    const targetCount = (usage?.weeklyCount ?? 0) + (usage?.exceptionCount ?? 0);

    if (
      !window.confirm(
        `${currentName} 위치 이름을 ${normalizedNextName}(으)로 변경할까요?\n적용된 일정 ${targetCount}개가 함께 수정됩니다.`,
      )
    ) {
      return;
    }

    setIsSaving(true);
    const supabase = getSupabase();
    const [weeklyResult, exceptionResult] = await Promise.all([
      supabase.from("weekly_schedules").update({ location: normalizedNextName }).eq("location", currentName),
      supabase.from("schedule_exceptions").update({ location: normalizedNextName }).eq("location", currentName),
    ]);
    setIsSaving(false);

    if (weeklyResult.error || exceptionResult.error) {
      setMessage(weeklyResult.error?.message ?? exceptionResult.error?.message ?? "위치 이름을 수정하지 못했습니다.");
      return;
    }

    if (location === currentName) {
      setLocation(normalizedNextName);
    }

    if (exceptionLocation === currentName) {
      setExceptionLocation(normalizedNextName);
    }

    setSelectedLocationName("");
    setNextLocationName("");
    setMessage("위치 이름과 적용된 일정들을 수정했습니다.");
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

  function toggleDay(day: number) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  function toggleScheduleStudent(studentId: string) {
    setScheduleStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  return (
    <main className="min-h-screen bg-emerald-50 text-stone-950">
      <div className="mx-auto w-full max-w-[430px] bg-white pb-12 shadow-sm">
        <header className="bg-emerald-700 px-5 py-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white p-1.5">
                <Image
                  src="/firststep-logo.jpg"
                  alt="첫단추 로고"
                  width={40}
                  height={40}
                  className="rounded-md"
                  priority
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-100">관리자</p>
                <h1 className="text-xl font-black">첫단추 차량시스템</h1>
              </div>
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
              <SubmitButton disabled={isSaving}>학생 등록</SubmitButton>
            </form>
            <button
              type="button"
              onClick={() => setShowStudentList((value) => !value)}
              className="mt-3 h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-black text-emerald-800"
            >
              {showStudentList ? "학생 목록 숨기기" : `전체 학생 목록 보기 ${activeStudents.length}명`}
            </button>
            {showStudentList ? (
              <div className="mt-3 space-y-3">
                <Input value={studentFilter} onChange={setStudentFilter} placeholder="학생 이름 검색" />
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {filteredStudents.length === 0 ? (
                    <p className="rounded-lg bg-stone-50 px-3 py-4 text-sm font-medium text-stone-500">
                      검색된 학생이 없습니다.
                    </p>
                  ) : (
                    filteredStudents.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-black text-stone-900">
                          {student.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteStudent(student)}
                          className="h-9 shrink-0 rounded-lg bg-red-50 px-3 text-xs font-black text-red-700"
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="반복 스케줄 등록">
            <form onSubmit={addWeeklySchedule} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Select value={scheduleType} onChange={(value) => setScheduleType(value as Exclude<ScheduleType, "MOVE">)}>
                  {SCHEDULE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
                <Input type="time" value={runTime} onChange={setRunTime} placeholder="시간" />
              </div>
              <StudentMultiPicker
                students={activeStudents}
                selectedIds={scheduleStudentIds}
                onToggle={toggleScheduleStudent}
                onClear={() => setScheduleStudentIds([])}
              />
              <DayPicker selectedDays={selectedDays} onToggle={toggleDay} />
              <LocationInput value={location} onChange={setLocation} locations={locations} />
              <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-sm font-black text-emerald-900">위치 이름 관리</p>
                <select
                  value={selectedLocationName}
                  onChange={(event) => {
                    setSelectedLocationName(event.target.value);
                    setNextLocationName(event.target.value);
                  }}
                  className="h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">{locations.length > 0 ? "수정할 위치 선택" : "등록된 위치 없음"}</option>
                  {locationUsages.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name} · 반복 {item.weeklyCount}개 · 예외 {item.exceptionCount}개
                    </option>
                  ))}
                </select>
                <Input value={nextLocationName} onChange={setNextLocationName} placeholder="새 위치 이름" />
                <button
                  type="button"
                  disabled={isSaving || !selectedLocationName}
                  onClick={() => void updateLocationName()}
                  className="h-11 w-full rounded-lg bg-emerald-700 text-sm font-black text-white disabled:bg-stone-300"
                >
                  위치 이름 수정
                </button>
              </div>
              <SubmitButton disabled={isSaving}>스케줄 등록</SubmitButton>
            </form>
          </Panel>

          <Panel title="이번 주 예외 등록">
            <form onSubmit={addException} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Select value={exceptionType} onChange={(value) => setExceptionType(value as ExceptionType)}>
                  {EXCEPTION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
                <Input type="date" value={exceptionDate} onChange={setExceptionDate} placeholder="날짜" />
              </div>
              <Select value={exceptionWeeklyId} onChange={selectExceptionWeeklySchedule}>
                <option value="">기본 일정 선택</option>
                {weeklySchedules
                  .filter((schedule) => schedule.schedule_type !== "MOVE")
                  .map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {DAYS.find((day) => day.value === schedule.day_of_week)?.label} {formatTime(schedule.run_time)}{" "}
                      {TYPE_LABEL[schedule.schedule_type]} {schedule.students?.name ?? ""}
                    </option>
                  ))}
              </Select>
              {exceptionType !== "CANCEL" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={exceptionScheduleType}
                      onChange={(value) => setExceptionScheduleType(value as Exclude<ScheduleType, "MOVE">)}
                    >
                      {SCHEDULE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </Select>
                    <Input type="time" value={exceptionTime} onChange={setExceptionTime} placeholder="시간" />
                  </div>
                  <Select value={exceptionStudentId} onChange={setExceptionStudentId}>
                    <option value="">학생 선택</option>
                    {activeStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </Select>
                  <LocationInput value={exceptionLocation} onChange={setExceptionLocation} locations={locations} />
                </>
              ) : null}
              <Input value={exceptionMemo} onChange={setExceptionMemo} placeholder="예외 메모" />
              <SubmitButton disabled={isSaving}>예외 등록</SubmitButton>
            </form>
          </Panel>

          <Panel title="반복 스케줄 관리">
            <ManageDayTabs selectedDay={scheduleManageDay} onSelect={setScheduleManageDay} />
            <Input value={scheduleFilter} onChange={setScheduleFilter} placeholder="학생/위치 검색" />
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {filteredSchedules.length === 0 ? (
                <p className="rounded-lg bg-stone-50 px-3 py-4 text-sm font-medium text-stone-500">
                  등록된 반복 스케줄이 없습니다.
                </p>
              ) : (
                filteredSchedules.map((schedule) => (
                  <CompactScheduleRow
                    key={schedule.id}
                    schedule={schedule}
                    onDelete={() => deleteWeeklySchedule(schedule.id)}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel title="예외 일정 관리">
            <ManageDayTabs selectedDay={exceptionManageDay} onSelect={setExceptionManageDay} />
            <Input value={exceptionFilter} onChange={setExceptionFilter} placeholder="학생/위치/날짜 검색" />
            <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {filteredExceptions.length === 0 ? (
                <p className="rounded-lg bg-stone-50 px-3 py-4 text-sm font-medium text-stone-500">
                  최근 예외 일정이 없습니다.
                </p>
              ) : (
                filteredExceptions.map((item) => (
                  <CompactExceptionRow key={item.id} item={item} onDelete={() => deleteException(item.id)} />
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function getKoreanWeekday(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-black text-emerald-900">{title}</h2>
      {children}
    </section>
  );
}

function DayPicker({
  selectedDays,
  onToggle,
}: {
  selectedDays: number[];
  onToggle: (day: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {DAYS.map((day) => (
        <button
          key={day.value}
          type="button"
          onClick={() => onToggle(day.value)}
          className={`h-10 rounded-lg text-sm font-black ${
            selectedDays.includes(day.value)
              ? "bg-emerald-700 text-white"
              : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
}

function StudentMultiPicker({
  students,
  selectedIds,
  onToggle,
  onClear,
}: {
  students: Student[];
  selectedIds: string[];
  onToggle: (studentId: string) => void;
  onClear: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const visibleStudents = useMemo(() => {
    const value = keyword.trim().toLocaleLowerCase("ko-KR");
    if (!value) {
      return students;
    }

    return students.filter((student) => student.name.toLocaleLowerCase("ko-KR").includes(value));
  }, [keyword, students]);

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-emerald-900">학생 선택 {selectedIds.length}명</p>
        {selectedIds.length > 0 ? (
          <button type="button" onClick={onClear} className="text-xs font-black text-red-600">
            선택 해제
          </button>
        ) : null}
      </div>
      <div className="mt-2">
        <Input value={keyword} onChange={setKeyword} placeholder="학생 이름 검색" />
      </div>
      <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1">
        {visibleStudents.length === 0 ? (
          <p className="col-span-2 rounded-lg bg-white px-3 py-3 text-sm font-medium text-stone-500">
            검색된 학생이 없습니다.
          </p>
        ) : (
          visibleStudents.map((student) => {
            const isSelected = selectedIds.includes(student.id);

            return (
              <button
                key={student.id}
                type="button"
                onClick={() => onToggle(student.id)}
                className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-black ${
                  isSelected
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-emerald-200 bg-white text-stone-800"
                }`}
              >
                {student.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ManageDayTabs({
  selectedDay,
  onSelect,
}: {
  selectedDay: number | null;
  onSelect: (day: number | null) => void;
}) {
  return (
    <div className="mb-3 grid grid-cols-6 gap-1.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`h-9 rounded-lg text-xs font-black ${
          selectedDay === null ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-900"
        }`}
      >
        전체
      </button>
      {DAYS.map((day) => (
        <button
          key={day.value}
          type="button"
          onClick={() => onSelect(day.value)}
          className={`h-9 rounded-lg text-xs font-black ${
            selectedDay === day.value ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
}

function CompactScheduleRow({
  schedule,
  onDelete,
}: {
  schedule: WeeklySchedule;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-black text-stone-900">
          {DAYS.find((day) => day.value === schedule.day_of_week)?.label} {formatTime(schedule.run_time)} ·{" "}
          {TYPE_LABEL[schedule.schedule_type]} · {schedule.students?.name ?? "학생 없음"}
        </div>
        <p className="truncate text-xs font-medium text-stone-500">{schedule.location}</p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="h-9 shrink-0 rounded-lg bg-red-50 px-3 text-xs font-black text-red-700"
      >
        삭제
      </button>
    </div>
  );
}

function CompactExceptionRow({
  item,
  onDelete,
}: {
  item: ScheduleException;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-black text-stone-900">
          {item.target_date} · {EXCEPTION_TYPES.find((type) => type.value === item.exception_type)?.label}
        </div>
        <p className="truncate text-xs font-medium text-stone-500">
          {item.run_time ? `${formatTime(item.run_time)} · ` : ""}
          {item.schedule_type ? `${TYPE_LABEL[item.schedule_type]} · ` : ""}
          {item.students?.name ?? "학생 없음"}
          {item.location ? ` · ${item.location}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="h-9 shrink-0 rounded-lg bg-red-50 px-3 text-xs font-black text-red-700"
      >
        삭제
      </button>
    </div>
  );
}

function LocationInput({
  value,
  onChange,
  locations,
}: {
  value: string;
  onChange: (value: string) => void;
  locations: string[];
}) {
  return (
    <div className="space-y-2">
      <select
        value=""
        onChange={(event) => {
          if (event.target.value) {
            onChange(event.target.value);
          }
        }}
        className="h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
      >
        <option value="">{locations.length > 0 ? "등록된 위치 선택" : "등록된 위치 없음"}</option>
        {locations.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="새 위치 입력 또는 선택한 위치 수정"
        className="h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
      />
    </div>
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
