"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ACADEMY_DROP_LOCATION, DAYS, formatDoneTime, formatTime, getSchedulePriority, TYPE_LABEL } from "@/lib/schedule";
import { getSupabase } from "@/lib/supabase";
import type {
  DailyScheduleStatus,
  ExceptionType,
  ScheduleException,
  ScheduleGroupOrder,
  ScheduleSnapshot,
  ScheduleSnapshotPayload,
  ScheduleType,
  Student,
  WeeklySchedule,
} from "@/lib/types";

type WeeklyScheduleGroup = {
  key: string;
  day_of_week: number;
  run_time: string;
  schedule_type: ScheduleType;
  location: string;
  schedules: WeeklySchedule[];
};

type CheckLog = DailyScheduleStatus & {
  students?: Pick<Student, "id" | "name"> | null;
  weekly_schedules?: Pick<WeeklySchedule, "run_time" | "schedule_type" | "location"> | null;
  schedule_exceptions?: Pick<ScheduleException, "run_time" | "schedule_type" | "location" | "exception_type"> | null;
};

type StudentScheduleType = Extract<ScheduleType, "PICKUP" | "DROP" | "DROP_START">;

const SCHEDULE_TYPES: { value: StudentScheduleType; label: string }[] = [
  { value: "PICKUP", label: "픽업" },
  { value: "DROP", label: "드랍" },
  { value: "DROP_START", label: "드랍 출발" },
];

const EXCEPTION_TYPES: { value: ExceptionType; label: string }[] = [
  { value: "ADD", label: "추가" },
  { value: "CANCEL", label: "취소" },
];

export function AdminPanel() {
  const [students, setStudents] = useState<Student[]>([]);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [snapshots, setSnapshots] = useState<ScheduleSnapshot[]>([]);
  const [checkLogs, setCheckLogs] = useState<CheckLog[]>([]);
  const [allExceptionLocations, setAllExceptionLocations] = useState<string[]>([]);
  const [studentName, setStudentName] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [showStudentList, setShowStudentList] = useState(false);
  const [scheduleStudentIds, setScheduleStudentIds] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);
  const [runTime, setRunTime] = useState("15:20");
  const [scheduleType, setScheduleType] = useState<StudentScheduleType>("PICKUP");
  const [location, setLocation] = useState("");
  const [academyDropDays, setAcademyDropDays] = useState<number[]>([1]);
  const [academyDropTime, setAcademyDropTime] = useState("18:00");
  const [academyDropManageDay, setAcademyDropManageDay] = useState<number | null>(null);
  const [exceptionType, setExceptionType] = useState<ExceptionType>("ADD");
  const [exceptionStudentIds, setExceptionStudentIds] = useState<string[]>([]);
  const [exceptionSearchStudentId, setExceptionSearchStudentId] = useState("");
  const [exceptionGroupKey, setExceptionGroupKey] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionTime, setExceptionTime] = useState("15:20");
  const [exceptionScheduleType, setExceptionScheduleType] = useState<StudentScheduleType>("PICKUP");
  const [exceptionLocation, setExceptionLocation] = useState("");
  const [exceptionMemo, setExceptionMemo] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [exceptionFilter, setExceptionFilter] = useState("");
  const [scheduleManageDay, setScheduleManageDay] = useState<number | null>(null);
  const [exceptionManageDay, setExceptionManageDay] = useState<number | null>(null);
  const [editingScheduleGroupKey, setEditingScheduleGroupKey] = useState("");
  const [editingScheduleIds, setEditingScheduleIds] = useState<string[]>([]);
  const [editingScheduleDay, setEditingScheduleDay] = useState(1);
  const [editingScheduleTime, setEditingScheduleTime] = useState("15:20");
  const [editingScheduleType, setEditingScheduleType] = useState<StudentScheduleType>("PICKUP");
  const [editingScheduleLocation, setEditingScheduleLocation] = useState("");
  const [selectedLocationName, setSelectedLocationName] = useState("");
  const [nextLocationName, setNextLocationName] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
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
      .filter((schedule) => schedule.student_id !== null)
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

  const filteredScheduleGroups = useMemo(() => groupWeeklySchedules(filteredSchedules), [filteredSchedules]);

  const filteredAcademyDropSchedules = useMemo(() => {
    return weeklySchedules
      .filter((schedule) => schedule.student_id === null)
      .filter((schedule) => schedule.schedule_type === "DROP")
      .filter((schedule) => schedule.location === ACADEMY_DROP_LOCATION)
      .filter((schedule) => academyDropManageDay === null || schedule.day_of_week === academyDropManageDay)
      .sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) {
          return a.day_of_week - b.day_of_week;
        }

        return formatTime(a.run_time).localeCompare(formatTime(b.run_time));
      });
  }, [academyDropManageDay, weeklySchedules]);

  const exceptionScheduleGroups = useMemo(() => {
    if (!exceptionDate || exceptionType === "ADD") {
      return [];
    }

    const targetDay = getKoreanWeekday(exceptionDate);
    const groups = groupWeeklySchedules(
      weeklySchedules
        .filter((schedule) => schedule.schedule_type !== "MOVE")
        .filter((schedule) => schedule.student_id !== null)
        .filter((schedule) => schedule.day_of_week === targetDay)
        .filter((schedule) => schedule.is_active),
    );

    if (!exceptionSearchStudentId) {
      return groups;
    }

    return groups.filter((group) =>
      group.schedules.some((schedule) => schedule.student_id === exceptionSearchStudentId),
    );
  }, [exceptionDate, exceptionSearchStudentId, exceptionType, weeklySchedules]);

  const selectedExceptionGroup = useMemo(
    () => exceptionScheduleGroups.find((group) => group.key === exceptionGroupKey) ?? null,
    [exceptionGroupKey, exceptionScheduleGroups],
  );

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

  function selectExceptionGroup(groupKey: string) {
    setExceptionGroupKey(groupKey);

    const selectedGroup = exceptionScheduleGroups.find((group) => group.key === groupKey);
    if (!selectedGroup) {
      setExceptionStudentIds([]);
      return;
    }

    if (
      exceptionType === "CANCEL" &&
      exceptionSearchStudentId &&
      selectedGroup.schedules.some((schedule) => schedule.student_id === exceptionSearchStudentId)
    ) {
      setExceptionStudentIds([exceptionSearchStudentId]);
    } else {
      setExceptionStudentIds(
        selectedGroup.schedules
          .map((schedule) => schedule.student_id)
          .filter((studentId): studentId is string => Boolean(studentId)),
      );
    }
    setExceptionTime(formatTime(selectedGroup.run_time));
    setExceptionScheduleType(
      selectedGroup.schedule_type === "DROP_START"
        ? "DROP_START"
        : selectedGroup.schedule_type === "DROP"
          ? "DROP"
          : "PICKUP",
    );
    setExceptionLocation(selectedGroup.location);
  }

  function selectExceptionSearchStudent(studentId: string) {
    setExceptionSearchStudentId(studentId);
    setExceptionGroupKey("");
    setExceptionStudentIds([]);
  }

  async function deleteCurrentWeeklySchedules() {
    const supabase = getSupabase();
    const alwaysDifferentUuid = "00000000-0000-0000-0000-000000000000";

    const [weeklyResult, orderResult] = await Promise.all([
      supabase.from("weekly_schedules").delete().neq("id", alwaysDifferentUuid),
      supabase.from("schedule_group_orders").delete().neq("id", alwaysDifferentUuid),
    ]);

    return weeklyResult.error ?? orderResult.error ?? null;
  }

  async function deleteCurrentSavedSchedules() {
    const supabase = getSupabase();
    const alwaysDifferentUuid = "00000000-0000-0000-0000-000000000000";

    const [exceptionResult, weeklyResult, orderResult] = await Promise.all([
      supabase.from("schedule_exceptions").delete().neq("id", alwaysDifferentUuid),
      supabase.from("weekly_schedules").delete().neq("id", alwaysDifferentUuid),
      supabase.from("schedule_group_orders").delete().neq("id", alwaysDifferentUuid),
    ]);

    return exceptionResult.error ?? weeklyResult.error ?? orderResult.error ?? null;
  }

  async function saveScheduleSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = snapshotName.trim();

    if (!name) {
      setMessage("저장 이름을 입력해 주세요.");
      return;
    }

    const supabase = getSupabase();
    const [orderResult, exceptionResult] = await Promise.all([
      supabase
        .from("schedule_group_orders")
        .select("day_of_week, run_time, schedule_type, location, sort_order"),
      supabase
        .from("schedule_exceptions")
        .select("student_id, weekly_schedule_id, target_date, run_time, schedule_type, location, exception_type, memo"),
    ]);

    if (orderResult.error || exceptionResult.error) {
      setMessage(orderResult.error?.message ?? exceptionResult.error?.message ?? "저장 데이터를 불러오지 못했습니다.");
      return;
    }

    const payload: ScheduleSnapshotPayload = {
      weekly_schedules: weeklySchedules.map((schedule) => ({
        source_id: schedule.id,
        student_id: schedule.student_id,
        day_of_week: schedule.day_of_week,
        run_time: formatTime(schedule.run_time),
        schedule_type: schedule.schedule_type,
        location: schedule.location,
        is_active: schedule.is_active,
      })),
      schedule_exceptions: ((exceptionResult.data ?? []) as ScheduleException[]).map((exception) => ({
        student_id: exception.student_id,
        weekly_schedule_id: exception.weekly_schedule_id,
        target_date: exception.target_date,
        run_time: exception.run_time ? formatTime(exception.run_time) : null,
        schedule_type: exception.schedule_type,
        location: exception.location,
        exception_type: exception.exception_type,
        memo: exception.memo,
      })),
      schedule_group_orders: (orderResult.data ?? []) as ScheduleGroupOrder[],
    };

    setIsSaving(true);
    const { error } = await getSupabase().from("schedule_snapshots").insert({
      name,
      payload,
    });
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSnapshotName("");
    setMessage(`현재 전체 일정을 "${name}" 이름으로 저장했습니다.`);
    void loadAdminData();
  }

  async function restoreScheduleSnapshot(snapshot: ScheduleSnapshot) {
    if (!window.confirm(`"${snapshot.name}" 저장본으로 현재 전체 일정을 교체할까요?`)) {
      return;
    }

    if (!window.confirm("현재 반복 스케줄, 학원드랍, 날짜별 변경 일정이 모두 삭제된 뒤 저장본으로 복원됩니다. 진행할까요?")) {
      return;
    }

    const payload = snapshot.payload;
    const scheduleRows = payload.weekly_schedules.map((schedule) => ({
      student_id: schedule.student_id,
      day_of_week: schedule.day_of_week,
      run_time: formatTime(schedule.run_time),
      schedule_type: schedule.schedule_type,
      location: schedule.location,
      is_active: schedule.is_active,
    }));
    const orderRows = (payload.schedule_group_orders ?? []).map((order) => ({
      day_of_week: order.day_of_week,
      run_time: formatTime(order.run_time),
      schedule_type: order.schedule_type,
      location: order.location,
      sort_order: order.sort_order,
    }));
    const exceptionRows = (payload.schedule_exceptions ?? []).map((exception) => ({
      student_id: exception.student_id,
      weekly_schedule_id: null,
      target_date: exception.target_date,
      run_time: exception.run_time ? formatTime(exception.run_time) : null,
      schedule_type: exception.schedule_type,
      location: exception.location,
      exception_type: exception.exception_type,
      memo: exception.memo,
    }));

    setIsSaving(true);
    const deleteError = await deleteCurrentSavedSchedules();
    if (deleteError) {
      setIsSaving(false);
      setMessage(deleteError.message);
      return;
    }

    const supabase = getSupabase();
    const [scheduleResult, exceptionResult, orderResult] = await Promise.all([
      scheduleRows.length > 0
        ? supabase.from("weekly_schedules").insert(scheduleRows)
        : Promise.resolve({ error: null }),
      exceptionRows.length > 0
        ? supabase.from("schedule_exceptions").insert(exceptionRows)
        : Promise.resolve({ error: null }),
      orderRows.length > 0
        ? supabase.from("schedule_group_orders").insert(orderRows)
        : Promise.resolve({ error: null }),
    ]);
    setIsSaving(false);

    if (scheduleResult.error || exceptionResult.error || orderResult.error) {
      setMessage(
        scheduleResult.error?.message ??
          exceptionResult.error?.message ??
          orderResult.error?.message ??
          "저장본을 복원하지 못했습니다.",
      );
      return;
    }

    setMessage(`"${snapshot.name}" 저장본을 복원했습니다.`);
    void loadAdminData();
  }

  async function resetWeeklySchedules() {
    if (!window.confirm("현재 반복 스케줄과 학원드랍을 모두 초기화할까요? 저장본과 예외 일정은 유지됩니다.")) {
      return;
    }

    if (!window.confirm("정말 초기화할까요? 현재 반복 시간표는 비워집니다.")) {
      return;
    }

    setIsSaving(true);
    const error = await deleteCurrentWeeklySchedules();
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("현재 반복 시간표를 초기화했습니다. 저장본과 예외 일정은 유지됩니다.");
    void loadAdminData();
  }

  async function deleteScheduleSnapshot(snapshot: ScheduleSnapshot) {
    if (!window.confirm(`"${snapshot.name}" 저장본을 삭제할까요?`)) {
      return;
    }

    const { error } = await getSupabase().from("schedule_snapshots").delete().eq("id", snapshot.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("저장본을 삭제했습니다.");
    void loadAdminData();
  }

  async function loadAdminData() {
    const supabase = getSupabase();
    const [
      studentsResult,
      weeklyResult,
      exceptionsResult,
      allExceptionLocationsResult,
      checkLogsResult,
      snapshotsResult,
    ] = await Promise.all([
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
      supabase
        .from("daily_schedule_status")
        .select(
          "id, weekly_schedule_id, schedule_exception_id, target_date, student_id, is_done, done_at, students(id, name), weekly_schedules(run_time, schedule_type, location), schedule_exceptions(run_time, schedule_type, location, exception_type)",
        )
        .order("target_date", { ascending: false })
        .order("done_at", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("schedule_snapshots")
        .select("id, name, payload, created_at, updated_at")
        .order("created_at", { ascending: false }),
    ]);

    if (
      studentsResult.error ||
      weeklyResult.error ||
      exceptionsResult.error ||
      allExceptionLocationsResult.error ||
      checkLogsResult.error ||
      snapshotsResult.error
    ) {
      setMessage(
        studentsResult.error?.message ??
          weeklyResult.error?.message ??
          exceptionsResult.error?.message ??
          snapshotsResult.error?.message ??
          checkLogsResult.error?.message ??
          "관리자 데이터를 불러오지 못했습니다.",
      );
      return;
    }

    setStudents((studentsResult.data ?? []) as Student[]);
    setWeeklySchedules((weeklyResult.data ?? []) as unknown as WeeklySchedule[]);
    setExceptions((exceptionsResult.data ?? []) as unknown as ScheduleException[]);
    setSnapshots((snapshotsResult.data ?? []) as unknown as ScheduleSnapshot[]);
    setAllExceptionLocations(
      (allExceptionLocationsResult.data ?? [])
        .map((item) => item.location)
        .filter((value): value is string => Boolean(value?.trim())),
    );
    setCheckLogs((checkLogsResult.data ?? []) as unknown as CheckLog[]);
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

    if (exceptionStudentIds.includes(student.id)) {
      setExceptionStudentIds((current) => current.filter((id) => id !== student.id));
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
    const scheduleRows = scheduleStudentIds.flatMap((studentId) =>
      selectedDays.map((day) => ({
        student_id: studentId,
        day_of_week: day,
        run_time: runTime,
        schedule_type: scheduleType,
        location: normalizedLocation,
        is_active: true,
      })),
    );
    const findDuplicateSchedules = (row: (typeof scheduleRows)[number]) =>
      weeklySchedules.filter(
        (schedule) =>
          schedule.is_active &&
          schedule.student_id === row.student_id &&
          schedule.day_of_week === row.day_of_week &&
          formatTime(schedule.run_time) === row.run_time &&
          schedule.schedule_type === row.schedule_type &&
          schedule.location.trim().toLocaleLowerCase("ko-KR") === row.location.toLocaleLowerCase("ko-KR"),
      );
    const duplicateSchedules = scheduleRows.flatMap((row) => findDuplicateSchedules(row));

    if (duplicateSchedules.length > 0) {
      const duplicateNames = Array.from(
        new Set(duplicateSchedules.map((schedule) => schedule.students?.name).filter(Boolean)),
      ).join(", ");

      if (
        !window.confirm(
          `같은 반복 스케줄이 이미 ${duplicateSchedules.length}개 있습니다.\n${
            duplicateNames ? `학생: ${duplicateNames}\n` : ""
          }중복된 일정은 새로 만들지 않고 기존 일정에 덮어쓸까요?`,
        )
      ) {
        return;
      }
    }

    setIsSaving(true);
    const supabase = getSupabase();
    const rowsToInsert = scheduleRows.filter((row) => findDuplicateSchedules(row).length === 0);
    const rowsToUpdate = scheduleRows.flatMap((row) =>
      findDuplicateSchedules(row).map((schedule) => ({
        id: schedule.id,
        row,
      })),
    );
    const [insertResult, updateResults] = await Promise.all([
      rowsToInsert.length > 0
        ? supabase.from("weekly_schedules").insert(rowsToInsert)
        : Promise.resolve({ error: null }),
      Promise.all(
        rowsToUpdate.map(({ id, row }) =>
          supabase
            .from("weekly_schedules")
            .update({
              student_id: row.student_id,
              day_of_week: row.day_of_week,
              run_time: row.run_time,
              schedule_type: row.schedule_type,
              location: row.location,
              is_active: true,
            })
            .eq("id", id),
        ),
      ),
    ]);
    setIsSaving(false);

    const updateError = updateResults.find((result) => result.error)?.error;
    if (insertResult.error || updateError) {
      setMessage(insertResult.error?.message ?? updateError?.message ?? "반복 스케줄을 저장하지 못했습니다.");
      return;
    }

    setLocation("");
    setMessage(`반복 스케줄을 저장했습니다. 새로 등록 ${rowsToInsert.length}개, 덮어쓰기 ${rowsToUpdate.length}개`);
    void loadAdminData();
  }

  async function addAcademyDropSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!academyDropTime || academyDropDays.length === 0) {
      setMessage("학원드랍 요일과 시간을 선택해 주세요.");
      return;
    }

    const scheduleRows = academyDropDays.map((day) => ({
      student_id: null,
      day_of_week: day,
      run_time: academyDropTime,
      schedule_type: "DROP" as const,
      location: ACADEMY_DROP_LOCATION,
      is_active: true,
    }));
    const findDuplicateSchedules = (row: (typeof scheduleRows)[number]) =>
      weeklySchedules.filter(
        (schedule) =>
          schedule.is_active &&
          schedule.student_id === null &&
          schedule.day_of_week === row.day_of_week &&
          formatTime(schedule.run_time) === row.run_time &&
          schedule.schedule_type === row.schedule_type &&
          schedule.location === row.location,
      );
    const duplicateSchedules = scheduleRows.flatMap((row) => findDuplicateSchedules(row));

    if (
      duplicateSchedules.length > 0 &&
      !window.confirm(`같은 학원드랍 일정이 이미 ${duplicateSchedules.length}개 있습니다. 기존 일정에 덮어쓸까요?`)
    ) {
      return;
    }

    setIsSaving(true);
    const supabase = getSupabase();
    const rowsToInsert = scheduleRows.filter((row) => findDuplicateSchedules(row).length === 0);
    const rowsToUpdate = scheduleRows.flatMap((row) =>
      findDuplicateSchedules(row).map((schedule) => ({
        id: schedule.id,
        row,
      })),
    );
    const [insertResult, updateResults] = await Promise.all([
      rowsToInsert.length > 0
        ? supabase.from("weekly_schedules").insert(rowsToInsert)
        : Promise.resolve({ error: null }),
      Promise.all(
        rowsToUpdate.map(({ id, row }) =>
          supabase
            .from("weekly_schedules")
            .update(row)
            .eq("id", id),
        ),
      ),
    ]);
    setIsSaving(false);

    const updateError = updateResults.find((result) => result.error)?.error;
    if (insertResult.error || updateError) {
      setMessage(insertResult.error?.message ?? updateError?.message ?? "학원드랍 일정을 저장하지 못했습니다.");
      return;
    }

    setMessage(`학원드랍 일정을 저장했습니다. 새로 등록 ${rowsToInsert.length}개, 덮어쓰기 ${rowsToUpdate.length}개`);
    void loadAdminData();
  }

  async function deleteAcademyDropSchedule(id: string) {
    if (!window.confirm("학원드랍 일정을 삭제할까요?")) {
      return;
    }

    const { error } = await getSupabase().from("weekly_schedules").delete().eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("학원드랍 일정을 삭제했습니다.");
    void loadAdminData();
  }

  async function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!exceptionDate) {
      setMessage("날짜를 선택해 주세요.");
      return;
    }

    if (exceptionType === "ADD" && (exceptionStudentIds.length === 0 || !exceptionLocation.trim() || !exceptionTime)) {
      setMessage("추가할 학생, 시간, 위치를 선택해 주세요.");
      return;
    }

    if (exceptionType === "CANCEL" && !selectedExceptionGroup) {
      setMessage("취소할 일정 묶음을 선택해 주세요.");
      return;
    }

    if (exceptionType === "CANCEL" && exceptionStudentIds.length === 0) {
      setMessage("취소할 학생을 선택해 주세요.");
      return;
    }

    const selectedBaseSchedules =
      selectedExceptionGroup?.schedules.filter((schedule) => exceptionStudentIds.includes(schedule.student_id ?? "")) ?? [];

    const payloads =
      exceptionType === "ADD"
        ? exceptionStudentIds.map((studentId) => ({
            student_id: studentId,
            weekly_schedule_id: null,
            target_date: exceptionDate,
            run_time: exceptionTime,
            schedule_type: exceptionScheduleType,
            location: exceptionLocation.trim(),
            exception_type: exceptionType,
            memo: exceptionMemo.trim() || null,
          }))
        : selectedBaseSchedules.map((schedule) => ({
            student_id: schedule.student_id,
            weekly_schedule_id: schedule.id,
            target_date: exceptionDate,
            run_time: null,
            schedule_type: null,
            location: null,
            exception_type: exceptionType,
            memo: exceptionMemo.trim() || null,
          }));

    setIsSaving(true);
    const { error } = await getSupabase().from("schedule_exceptions").insert(payloads as never[]);
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setExceptionStudentIds([]);
    setExceptionGroupKey("");
    setExceptionMemo("");
    setMessage(`스케줄 변경을 저장했습니다. ${payloads.length}개 적용`);
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

  function startEditScheduleGroup(group: WeeklyScheduleGroup) {
    setEditingScheduleGroupKey(group.key);
    setEditingScheduleIds(group.schedules.map((schedule) => schedule.id));
    setEditingScheduleDay(group.day_of_week);
    setEditingScheduleTime(formatTime(group.run_time));
    setEditingScheduleType(group.schedule_type === "DROP" ? "DROP" : "PICKUP");
    setEditingScheduleLocation(group.location);
  }

  function toggleEditingSchedule(scheduleId: string) {
    setEditingScheduleIds((current) =>
      current.includes(scheduleId)
        ? current.filter((id) => id !== scheduleId)
        : [...current, scheduleId],
    );
  }

  async function deleteSelectedWeeklySchedules() {
    if (editingScheduleIds.length === 0) {
      setMessage("삭제할 학생을 선택해 주세요.");
      return;
    }

    if (!window.confirm(`선택한 ${editingScheduleIds.length}개 스케줄을 삭제할까요?`)) {
      return;
    }

    const { error } = await getSupabase().from("weekly_schedules").delete().in("id", editingScheduleIds);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingScheduleGroupKey("");
    setEditingScheduleIds([]);
    setMessage("선택한 스케줄을 삭제했습니다.");
    void loadAdminData();
  }

  async function updateSelectedWeeklySchedules() {
    if (editingScheduleIds.length === 0) {
      setMessage("변경할 학생을 선택해 주세요.");
      return;
    }

    if (!editingScheduleLocation.trim() || !editingScheduleTime) {
      setMessage("변경할 시간과 위치를 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    const { error } = await getSupabase()
      .from("weekly_schedules")
      .update({
        day_of_week: editingScheduleDay,
        run_time: editingScheduleTime,
        schedule_type: editingScheduleType,
        location: editingScheduleLocation.trim(),
        is_active: true,
      })
      .in("id", editingScheduleIds);
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEditingScheduleGroupKey("");
    setEditingScheduleIds([]);
    setMessage(`선택한 ${editingScheduleIds.length}개 스케줄을 변경했습니다.`);
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

  function toggleAcademyDropDay(day: number) {
    setAcademyDropDays((current) =>
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

  function toggleExceptionStudent(studentId: string) {
    setExceptionStudentIds((current) =>
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

          <Panel title="시간표 저장/복원">
            <form onSubmit={saveScheduleSnapshot} className="space-y-3">
              <Input value={snapshotName} onChange={setSnapshotName} placeholder="저장 이름 예: 2026 1학기" />
              <SubmitButton disabled={isSaving}>현재 시간표 저장</SubmitButton>
            </form>
            <button
              type="button"
              disabled={isSaving || weeklySchedules.length === 0}
              onClick={() => void resetWeeklySchedules()}
              className="h-11 w-full rounded-lg bg-red-50 text-sm font-black text-red-700 disabled:bg-stone-100 disabled:text-stone-400"
            >
              현재 반복 시간표 초기화
            </button>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {snapshots.length === 0 ? (
                <p className="rounded-lg bg-stone-50 px-3 py-4 text-sm font-medium text-stone-500">
                  저장된 시간표가 없습니다.
                </p>
              ) : (
                snapshots.map((snapshot) => (
                  <SnapshotRow
                    key={snapshot.id}
                    snapshot={snapshot}
                    isSaving={isSaving}
                    onRestore={() => void restoreScheduleSnapshot(snapshot)}
                    onDelete={() => void deleteScheduleSnapshot(snapshot)}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel title="확인">
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {checkLogs.length === 0 ? (
                <p className="rounded-lg bg-stone-50 px-3 py-4 text-sm font-medium text-stone-500">
                  확인할 체크 로그가 없습니다.
                </p>
              ) : (
                checkLogs.map((log) => <CheckLogRow key={log.id} log={log} />)
              )}
            </div>
          </Panel>

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

          <Panel title="스케줄 등록">
            <form onSubmit={addWeeklySchedule} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Select value={scheduleType} onChange={(value) => setScheduleType(value as StudentScheduleType)}>
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
              <SubmitButton disabled={isSaving}>스케줄 등록</SubmitButton>
            </form>
          </Panel>

          <Panel title="학원드랍 등록">
            <form onSubmit={addAcademyDropSchedule} className="space-y-3">
              <DayPicker selectedDays={academyDropDays} onToggle={toggleAcademyDropDay} />
              <Input type="time" value={academyDropTime} onChange={setAcademyDropTime} placeholder="시간" />
              <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-900">
                {formatTime(academyDropTime)} 첫단추영어학원 드랍
              </div>
              <SubmitButton disabled={isSaving}>학원드랍 등록</SubmitButton>
            </form>
            <div className="mt-4 border-t border-emerald-100 pt-4">
              <ManageDayTabs selectedDay={academyDropManageDay} onSelect={setAcademyDropManageDay} />
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                {filteredAcademyDropSchedules.length === 0 ? (
                  <p className="rounded-lg bg-stone-50 px-3 py-4 text-sm font-medium text-stone-500">
                    등록된 학원드랍 일정이 없습니다.
                  </p>
                ) : (
                  filteredAcademyDropSchedules.map((schedule) => (
                    <AcademyDropManageRow
                      key={schedule.id}
                      schedule={schedule}
                      onDelete={() => void deleteAcademyDropSchedule(schedule.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </Panel>

          <Panel title="위치 이름 관리">
            <div className="space-y-3">
              <select
                value={selectedLocationName}
                onChange={(event) => {
                  setSelectedLocationName(event.target.value);
                  setNextLocationName(event.target.value);
                }}
                className="h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold outline-none focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
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
          </Panel>

          <Panel title="스케줄 변경">
            <form onSubmit={addException} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={exceptionType}
                  onChange={(value) => {
                    setExceptionType(value as ExceptionType);
                    setExceptionSearchStudentId("");
                    setExceptionGroupKey("");
                    setExceptionStudentIds([]);
                  }}
                >
                  {EXCEPTION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
                <Input
                  type="date"
                  value={exceptionDate}
                  onChange={(value) => {
                    setExceptionDate(value);
                    setExceptionSearchStudentId("");
                    setExceptionGroupKey("");
                    setExceptionStudentIds([]);
                  }}
                  placeholder="날짜"
                />
              </div>

              {exceptionType === "ADD" ? (
                <StudentMultiPicker
                  students={activeStudents}
                  selectedIds={exceptionStudentIds}
                  onToggle={toggleExceptionStudent}
                  onClear={() => setExceptionStudentIds([])}
                />
              ) : (
                <>
                  {exceptionDate ? (
                    <StudentSearchPicker
                      students={activeStudents}
                      selectedId={exceptionSearchStudentId}
                      onSelect={selectExceptionSearchStudent}
                      onClear={() => {
                        setExceptionSearchStudentId("");
                        setExceptionGroupKey("");
                        setExceptionStudentIds([]);
                      }}
                    />
                  ) : null}
                  {exceptionSearchStudentId ? (
                    <>
                      <Select value={exceptionGroupKey} onChange={selectExceptionGroup}>
                        <option value="">
                          {exceptionScheduleGroups.length > 0 ? "취소할 일정 묶음 선택" : "해당 학생 일정 없음"}
                        </option>
                        {exceptionScheduleGroups.map((group) => (
                          <option key={group.key} value={group.key}>
                            {formatTime(group.run_time)} {TYPE_LABEL[group.schedule_type]} {group.location} ·{" "}
                            {group.schedules.length}명
                          </option>
                        ))}
                      </Select>
                      {selectedExceptionGroup ? (
                        <ScheduleStudentPicker
                          schedules={selectedExceptionGroup.schedules}
                          selectedIds={exceptionStudentIds}
                          onToggle={toggleExceptionStudent}
                          onSelectAll={() =>
                            setExceptionStudentIds(
                              selectedExceptionGroup.schedules
                                .map((schedule) => schedule.student_id)
                                .filter((studentId): studentId is string => Boolean(studentId)),
                            )
                          }
                          onClear={() => setExceptionStudentIds([])}
                        />
                      ) : null}
                    </>
                  ) : (
                    <p className="rounded-lg bg-stone-50 px-3 py-3 text-sm font-bold text-stone-500">
                      날짜 선택 후 학생을 검색해서 선택하세요.
                    </p>
                  )}
                </>
              )}

              {exceptionType !== "CANCEL" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={exceptionScheduleType}
                      onChange={(value) => setExceptionScheduleType(value as StudentScheduleType)}
                    >
                      {SCHEDULE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </Select>
                    <Input type="time" value={exceptionTime} onChange={setExceptionTime} placeholder="시간" />
                  </div>
                  <LocationInput value={exceptionLocation} onChange={setExceptionLocation} locations={locations} />
                </>
              ) : null}
              <Input value={exceptionMemo} onChange={setExceptionMemo} placeholder="예외 메모" />
              <SubmitButton disabled={isSaving}>스케줄 변경 저장</SubmitButton>
            </form>
          </Panel>

          <Panel title="스케줄 관리">
            <ManageDayTabs selectedDay={scheduleManageDay} onSelect={setScheduleManageDay} />
            <Input value={scheduleFilter} onChange={setScheduleFilter} placeholder="학생/위치 검색" />
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {filteredScheduleGroups.length === 0 ? (
                <p className="rounded-lg bg-stone-50 px-3 py-4 text-sm font-medium text-stone-500">
                  등록된 반복 스케줄이 없습니다.
                </p>
              ) : (
                filteredScheduleGroups.map((group) => (
                  <ScheduleManageGroup
                    key={group.key}
                    group={group}
                    isEditing={editingScheduleGroupKey === group.key}
                    selectedIds={editingScheduleIds}
                    editDay={editingScheduleDay}
                    editTime={editingScheduleTime}
                    editType={editingScheduleType}
                    editLocation={editingScheduleLocation}
                    locations={locations}
                    isSaving={isSaving}
                    onStartEdit={() => startEditScheduleGroup(group)}
                    onCancelEdit={() => {
                      setEditingScheduleGroupKey("");
                      setEditingScheduleIds([]);
                    }}
                    onToggleSchedule={toggleEditingSchedule}
                    onSelectAll={() => setEditingScheduleIds(group.schedules.map((schedule) => schedule.id))}
                    onClear={() => setEditingScheduleIds([])}
                    onChangeDay={setEditingScheduleDay}
                    onChangeTime={setEditingScheduleTime}
                    onChangeType={setEditingScheduleType}
                    onChangeLocation={setEditingScheduleLocation}
                    onDelete={() => void deleteSelectedWeeklySchedules()}
                    onUpdate={() => void updateSelectedWeeklySchedules()}
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

function groupWeeklySchedules(schedules: WeeklySchedule[]) {
  const groupMap = new Map<string, WeeklyScheduleGroup>();

  for (const schedule of schedules) {
    const key = `${schedule.day_of_week}-${formatTime(schedule.run_time)}-${schedule.schedule_type}-${schedule.location}`;
    const group = groupMap.get(key);

    if (group) {
      group.schedules.push(schedule);
      continue;
    }

    groupMap.set(key, {
      key,
      day_of_week: schedule.day_of_week,
      run_time: schedule.run_time,
      schedule_type: schedule.schedule_type,
      location: schedule.location,
      schedules: [schedule],
    });
  }

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      schedules: [...group.schedules].sort((a, b) =>
        (a.students?.name ?? "").localeCompare(b.students?.name ?? "", "ko"),
      ),
    }))
    .sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) {
        return a.day_of_week - b.day_of_week;
      }

      const timeCompare = formatTime(a.run_time).localeCompare(formatTime(b.run_time));
      if (timeCompare !== 0) {
        return timeCompare;
      }

      const priorityCompare = getSchedulePriority(a) - getSchedulePriority(b);
      if (priorityCompare !== 0) {
        return priorityCompare;
      }

      return a.location.localeCompare(b.location, "ko");
    });
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-lg border border-emerald-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
          isOpen ? "bg-emerald-700 text-white" : "bg-white text-emerald-900"
        }`}
      >
        <span className="text-base font-black">{title}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-lg font-black text-emerald-800">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen ? <div className="space-y-3 border-t border-emerald-100 p-4">{children}</div> : null}
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

function CheckLogRow({ log }: { log: CheckLog }) {
  const schedule = log.schedule_exceptions ?? log.weekly_schedules;
  const time = schedule?.run_time ? formatTime(schedule.run_time) : "";
  const typeLabel = schedule?.schedule_type ? TYPE_LABEL[schedule.schedule_type] : "";
  const location = schedule?.location ?? "";

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-black text-stone-900">
          {log.students?.name ?? "학생 없음"} · {log.is_done ? "완료" : "미완료"}
        </p>
        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-black ${
          log.is_done ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"
        }`}>
          {log.done_at ? formatDoneTime(log.done_at) : "-"}
        </span>
      </div>
      <p className="mt-1 truncate text-xs font-bold text-stone-500">
        {log.target_date} {time} {typeLabel} {location}
      </p>
    </div>
  );
}

function SnapshotRow({
  snapshot,
  isSaving,
  onRestore,
  onDelete,
}: {
  snapshot: ScheduleSnapshot;
  isSaving: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const weeklyCount = snapshot.payload.weekly_schedules.length;
  const exceptionCount = snapshot.payload.schedule_exceptions?.length ?? 0;
  const scheduleCount = weeklyCount + exceptionCount;
  const createdAt = new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(snapshot.created_at));

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-stone-900">{snapshot.name}</p>
        <p className="mt-1 text-xs font-bold text-stone-500">
          {createdAt} · 전체 일정 {scheduleCount}개
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={onRestore}
          className="h-10 rounded-lg bg-emerald-700 text-sm font-black text-white disabled:bg-stone-300"
        >
          복원
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={onDelete}
          className="h-10 rounded-lg bg-red-50 text-sm font-black text-red-700 disabled:bg-stone-100 disabled:text-stone-400"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

function AcademyDropManageRow({
  schedule,
  onDelete,
}: {
  schedule: WeeklySchedule;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-cyan-950">
          {DAYS.find((day) => day.value === schedule.day_of_week)?.label} {formatTime(schedule.run_time)}
        </p>
        <p className="truncate text-xs font-bold text-cyan-700">첫단추영어학원 드랍</p>
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

function StudentSearchPicker({
  students,
  selectedId,
  onSelect,
  onClear,
}: {
  students: Student[];
  selectedId: string;
  onSelect: (studentId: string) => void;
  onClear: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const selectedStudent = students.find((student) => student.id === selectedId) ?? null;
  const visibleStudents = useMemo(() => {
    const value = keyword.trim().toLocaleLowerCase("ko-KR");
    if (!value) {
      return students.slice(0, 12);
    }

    return students
      .filter((student) => student.name.toLocaleLowerCase("ko-KR").includes(value))
      .slice(0, 12);
  }, [keyword, students]);

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-emerald-900">
          {selectedStudent ? `선택: ${selectedStudent.name}` : "학생 검색"}
        </p>
        {selectedId ? (
          <button type="button" onClick={onClear} className="text-xs font-black text-red-600">
            해제
          </button>
        ) : null}
      </div>
      <div className="mt-2">
        <Input value={keyword} onChange={setKeyword} placeholder="학생 이름 검색" />
      </div>
      <div className="mt-2 grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1">
        {visibleStudents.length === 0 ? (
          <p className="col-span-2 rounded-lg bg-white px-3 py-3 text-sm font-medium text-stone-500">
            검색된 학생이 없습니다.
          </p>
        ) : (
          visibleStudents.map((student) => {
            const isSelected = selectedId === student.id;

            return (
              <button
                key={student.id}
                type="button"
                onClick={() => onSelect(student.id)}
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

function ScheduleStudentPicker({
  schedules,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
}: {
  schedules: WeeklySchedule[];
  selectedIds: string[];
  onToggle: (studentId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-emerald-900">인원 선택 {selectedIds.length}명</p>
        <div className="flex gap-2">
          <button type="button" onClick={onSelectAll} className="text-xs font-black text-emerald-700">
            전체
          </button>
          <button type="button" onClick={onClear} className="text-xs font-black text-red-600">
            해제
          </button>
        </div>
      </div>
      <div className="mt-2 grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1">
        {schedules.map((schedule) => {
          const studentId = schedule.student_id;
          const isSelected = Boolean(studentId && selectedIds.includes(studentId));

          return (
            <button
              key={schedule.id}
              type="button"
              disabled={!studentId}
              onClick={() => studentId && onToggle(studentId)}
              className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-black ${
                isSelected
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-emerald-200 bg-white text-stone-800"
              }`}
            >
              {schedule.students?.name ?? "학생 없음"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleManageGroup({
  group,
  isEditing,
  selectedIds,
  editDay,
  editTime,
  editType,
  editLocation,
  locations,
  isSaving,
  onStartEdit,
  onCancelEdit,
  onToggleSchedule,
  onSelectAll,
  onClear,
  onChangeDay,
  onChangeTime,
  onChangeType,
  onChangeLocation,
  onDelete,
  onUpdate,
}: {
  group: WeeklyScheduleGroup;
  isEditing: boolean;
  selectedIds: string[];
  editDay: number;
  editTime: string;
  editType: StudentScheduleType;
  editLocation: string;
  locations: string[];
  isSaving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onToggleSchedule: (scheduleId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onChangeDay: (day: number) => void;
  onChangeTime: (time: string) => void;
  onChangeType: (type: StudentScheduleType) => void;
  onChangeLocation: (location: string) => void;
  onDelete: () => void;
  onUpdate: () => void;
}) {
  const isAcademyDrop =
    group.schedules.every((schedule) => schedule.student_id === null) &&
    group.schedule_type === "DROP" &&
    group.location === ACADEMY_DROP_LOCATION;

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-stone-900">
            {DAYS.find((day) => day.value === group.day_of_week)?.label} {formatTime(group.run_time)} ·{" "}
            {isAcademyDrop ? "학원드랍" : TYPE_LABEL[group.schedule_type]}
          </div>
          <p className="truncate text-xs font-medium text-stone-500">{group.location}</p>
          <p className="mt-1 text-xs font-bold text-stone-500">
            {isAcademyDrop ? "얇은 안내 일정" : `${group.schedules.length}명 · ${group.schedules.map((schedule) => schedule.students?.name ?? "학생 없음").join(", ")}`}
          </p>
        </div>
        <button
          type="button"
          onClick={isEditing ? onCancelEdit : onStartEdit}
          className="h-9 shrink-0 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white"
        >
          {isEditing ? "닫기" : "변경"}
        </button>
      </div>

      {isEditing ? (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
          <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-stone-500">
            삭제 또는 변경할 인원을 선택하세요.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={String(editDay)} onChange={(value) => onChangeDay(Number(value))}>
              {DAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </Select>
            <Input type="time" value={editTime} onChange={onChangeTime} placeholder="시간" />
          </div>
          <Select value={editType} onChange={(value) => onChangeType(value as StudentScheduleType)}>
            {SCHEDULE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
          <LocationInput value={editLocation} onChange={onChangeLocation} locations={locations} />
          <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {group.schedules.map((schedule) => {
              const isSelected = selectedIds.includes(schedule.id);

              return (
                <button
                  key={schedule.id}
                  type="button"
                  onClick={() => onToggleSchedule(schedule.id)}
                  className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-black ${
                    isSelected
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-emerald-200 bg-white text-stone-800"
                  }`}
                >
                  {schedule.students?.name ?? "학원드랍"}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onSelectAll} className="h-10 rounded-lg bg-emerald-50 text-sm font-black text-emerald-800">
              전체 선택
            </button>
            <button type="button" onClick={onClear} className="h-10 rounded-lg bg-stone-100 text-sm font-black text-stone-700">
              선택 해제
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isSaving || selectedIds.length === 0}
              onClick={onDelete}
              className="h-11 rounded-lg bg-red-50 text-sm font-black text-red-700 disabled:bg-stone-100 disabled:text-stone-400"
            >
              선택 삭제
            </button>
            <button
              type="button"
              disabled={isSaving || selectedIds.length === 0}
              onClick={onUpdate}
              className="h-11 rounded-lg bg-emerald-700 text-sm font-black text-white disabled:bg-stone-300"
            >
              선택 변경
            </button>
          </div>
        </div>
      ) : null}
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
