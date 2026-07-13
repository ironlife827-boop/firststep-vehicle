"use client";

import Image from "next/image";
import Link from "next/link";
import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  buildScheduleItems,
  buildStatusMap,
  DAYS,
  filterItems,
  formatDoneTime,
  formatTime,
  getDateForWeekday,
  getTodayDayOfWeek,
  groupScheduleItems,
  isAcademyDropGroup,
  isPastScheduleTime,
  scheduleGroupOrderKey,
  statusKey,
  TYPE_LABEL,
} from "@/lib/schedule";
import type {
  DailyScheduleStatus,
  ScheduleException,
  ScheduleGroup,
  ScheduleGroupOrder,
  ScheduleItem,
  WeeklySchedule,
} from "@/lib/types";

const TYPE_CLASS = {
  PICKUP: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  DROP: "bg-cyan-100 text-cyan-800 ring-cyan-200",
  DROP_START: "bg-orange-100 text-orange-800 ring-orange-200",
  MOVE: "bg-stone-100 text-stone-700 ring-stone-200",
};

export function ScheduleBoard() {
  const [selectedDay, setSelectedDay] = useState(getTodayDayOfWeek);
  const [searchTerm, setSearchTerm] = useState("");
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [statuses, setStatuses] = useState<DailyScheduleStatus[]>([]);
  const [groupOrders, setGroupOrders] = useState<ScheduleGroupOrder[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showPastSchedules, setShowPastSchedules] = useState(false);
  const [draggingKey, setDraggingKey] = useState("");
  const [isOrderEditMode, setIsOrderEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragKeyRef = useRef("");
  const pendingOrderRowsRef = useRef<ScheduleGroupOrder[]>([]);

  const targetDate = useMemo(() => getDateForWeekday(selectedDay), [selectedDay]);
  const statusMap = useMemo(() => buildStatusMap(statuses), [statuses]);

  const groups = useMemo(() => {
    const items = buildScheduleItems(weeklySchedules, exceptions, targetDate);
    return groupScheduleItems(filterItems(items, searchTerm), groupOrders, selectedDay);
  }, [weeklySchedules, exceptions, targetDate, searchTerm, groupOrders, selectedDay]);

  const pastGroups = useMemo(
    () => groups.filter((group) => isPastScheduleTime(targetDate, group.run_time)),
    [groups, targetDate],
  );

  const visibleGroups = useMemo(
    () => (showPastSchedules ? groups : groups.filter((group) => !isPastScheduleTime(targetDate, group.run_time))),
    [groups, showPastSchedules, targetDate],
  );

  const mergeStatus = useCallback((nextStatus: DailyScheduleStatus) => {
    if (nextStatus.target_date !== targetDate) {
      return;
    }

    const nextKey = statusKey(
      nextStatus.weekly_schedule_id,
      nextStatus.schedule_exception_id,
      nextStatus.target_date,
      nextStatus.student_id,
    );

    setStatuses((prev) => {
      const index = prev.findIndex((status) => {
        if (status.id === nextStatus.id) {
          return true;
        }

        return (
          statusKey(
            status.weekly_schedule_id,
            status.schedule_exception_id,
            status.target_date,
            status.student_id,
          ) === nextKey
        );
      });

      if (index === -1) {
        return [...prev, nextStatus];
      }

      const next = [...prev];
      next[index] = nextStatus;
      return next;
    });
  }, [targetDate]);

  const removeStatus = useCallback((removedStatus: DailyScheduleStatus) => {
    setStatuses((prev) => prev.filter((status) => status.id !== removedStatus.id));
  }, []);

  const loadSchedule = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;

    if (showLoading) {
      setIsLoading(true);
    }
    setErrorMessage("");

    const supabase = getSupabase();
    const [weeklyResult, exceptionResult, statusResult, orderResult] = await Promise.all([
      supabase
        .from("weekly_schedules")
        .select("id, student_id, day_of_week, run_time, schedule_type, location, is_active, students(id, name, memo, is_active)")
        .eq("day_of_week", selectedDay)
        .eq("is_active", true)
        .neq("schedule_type", "MOVE")
        .order("run_time", { ascending: true }),
      supabase
        .from("schedule_exceptions")
        .select("id, student_id, weekly_schedule_id, target_date, run_time, schedule_type, location, exception_type, memo, students(id, name, memo, is_active)")
        .eq("target_date", targetDate),
      supabase
        .from("daily_schedule_status")
        .select("id, weekly_schedule_id, schedule_exception_id, target_date, student_id, is_done, done_at")
        .eq("target_date", targetDate),
      supabase
        .from("schedule_group_orders")
        .select("id, day_of_week, run_time, schedule_type, location, sort_order")
        .eq("day_of_week", selectedDay),
    ]);

    if (weeklyResult.error || exceptionResult.error || statusResult.error || orderResult.error) {
      setErrorMessage(
        weeklyResult.error?.message ??
          exceptionResult.error?.message ??
          statusResult.error?.message ??
          "스케줄을 불러오지 못했습니다.",
      );
    } else {
      setWeeklySchedules((weeklyResult.data ?? []) as unknown as WeeklySchedule[]);
      setExceptions((exceptionResult.data ?? []) as unknown as ScheduleException[]);
      setStatuses((statusResult.data ?? []) as unknown as DailyScheduleStatus[]);
      setGroupOrders((orderResult.data ?? []) as ScheduleGroupOrder[]);
    }

    if (showLoading) {
      setIsLoading(false);
    }
  }, [selectedDay, targetDate]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSchedule({ showLoading: true });
    });

    const supabase = getSupabase();
    const channel = supabase
      .channel(`schedule-board-${selectedDay}-${targetDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_schedule_status" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            removeStatus(payload.old as DailyScheduleStatus);
            return;
          }

          mergeStatus(payload.new as DailyScheduleStatus);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_schedules" },
        () => void loadSchedule({ showLoading: false }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_exceptions" },
        () => void loadSchedule({ showLoading: false }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_group_orders" },
        () => void loadSchedule({ showLoading: false }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadSchedule, mergeStatus, removeStatus, selectedDay, targetDate]);

  async function toggleDone(item: ScheduleItem) {
    const key = statusKey(
      item.weekly_schedule_id,
      item.schedule_exception_id,
      item.target_date,
      item.student_id,
    );
    const current = statusMap.get(key);
    const nextDone = !current?.is_done;
    const supabase = getSupabase();

    if (current) {
      setStatuses((prev) =>
        prev.map((status) =>
          status.id === current.id
            ? { ...status, is_done: nextDone, done_at: nextDone ? new Date().toISOString() : null }
            : status,
        ),
      );

      const { error } = await supabase
        .from("daily_schedule_status")
        .update({ is_done: nextDone, done_at: nextDone ? new Date().toISOString() : null })
        .eq("id", current.id);

      if (error) {
        setErrorMessage(error.message);
        void loadSchedule();
      }
      return;
    }

    const draftId = `draft-${key}`;
    const newStatus: DailyScheduleStatus = {
      id: draftId,
      weekly_schedule_id: item.weekly_schedule_id,
      schedule_exception_id: item.schedule_exception_id,
      target_date: item.target_date,
      student_id: item.student_id,
      is_done: true,
      done_at: new Date().toISOString(),
    };

    setStatuses((prev) => [...prev, newStatus]);

    const { data, error } = await supabase
      .from("daily_schedule_status")
      .insert({
        weekly_schedule_id: item.weekly_schedule_id,
        schedule_exception_id: item.schedule_exception_id,
        target_date: item.target_date,
        student_id: item.student_id,
        is_done: true,
        done_at: new Date().toISOString(),
      })
      .select("id, weekly_schedule_id, schedule_exception_id, target_date, student_id, is_done, done_at")
      .single();

    if (error) {
      setErrorMessage(error.message);
      void loadSchedule({ showLoading: false });
      return;
    }

    mergeStatus(data as DailyScheduleStatus);
  }

  function toggleGroup(key: string) {
    if (draggingKey) {
      return;
    }

    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function clearLongPressTimer() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function beginGroupPress(event: PointerEvent<HTMLElement>, group: ScheduleGroup) {
    clearLongPressTimer();
    if (isAcademyDropGroup(group) || searchTerm.trim()) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    longPressTimer.current = setTimeout(() => {
      dragKeyRef.current = group.key;
      setDraggingKey(group.key);
    }, 350);
  }

  function moveGroupToTarget(targetKey: string) {
    const sourceKey = dragKeyRef.current;
    if (!sourceKey || sourceKey === targetKey) {
      return;
    }

    const sourceGroup = visibleGroups.find((group) => group.key === sourceKey);
    const targetGroup = visibleGroups.find((group) => group.key === targetKey);
    if (
      !sourceGroup ||
      !targetGroup ||
      isAcademyDropGroup(sourceGroup) ||
      isAcademyDropGroup(targetGroup) ||
      formatTime(sourceGroup.run_time) !== formatTime(targetGroup.run_time)
    ) {
      return;
    }

    const sameTimeGroups = visibleGroups.filter(
      (group) => formatTime(group.run_time) === formatTime(sourceGroup.run_time) && !isAcademyDropGroup(group),
    );
    const orderedKeys = sameTimeGroups.map((group) => group.key);
    const fromIndex = orderedKeys.indexOf(sourceKey);
    const toIndex = orderedKeys.indexOf(targetKey);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const [movedKey] = orderedKeys.splice(fromIndex, 1);
    orderedKeys.splice(toIndex, 0, movedKey);

    const nextRows = orderedKeys
      .map((key, index) => {
        const group = sameTimeGroups.find((item) => item.key === key);
        if (!group) {
          return null;
        }

        return {
          day_of_week: selectedDay,
          run_time: formatTime(group.run_time),
          schedule_type: group.schedule_type,
          location: group.location,
          sort_order: index,
        } satisfies ScheduleGroupOrder;
      })
      .filter((row): row is ScheduleGroupOrder => Boolean(row));

    pendingOrderRowsRef.current = nextRows;
    setGroupOrders((current) => {
      const replaceKeys = new Set(
        nextRows.map((row) => scheduleGroupOrderKey(selectedDay, row.run_time, row.schedule_type, row.location)),
      );
      const kept = current.filter(
        (row) => !replaceKeys.has(scheduleGroupOrderKey(selectedDay, row.run_time, row.schedule_type, row.location)),
      );
      return [...kept, ...nextRows];
    });
  }

  function moveGroupByPointer(event: PointerEvent<HTMLElement>) {
    if (!dragKeyRef.current) {
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-group-key]");
    const targetKey = target?.getAttribute("data-group-key");
    if (targetKey) {
      moveGroupToTarget(targetKey);
    }
  }

  async function finishGroupDrag() {
    clearLongPressTimer();
    const rows = pendingOrderRowsRef.current;
    dragKeyRef.current = "";
    pendingOrderRowsRef.current = [];
    setDraggingKey("");

    if (rows.length === 0) {
      return;
    }

    const { error } = await getSupabase()
      .from("schedule_group_orders")
      .upsert(rows as never[], { onConflict: "day_of_week,run_time,schedule_type,location" });

    if (error) {
      setErrorMessage(error.message);
      void loadSchedule({ showLoading: false });
    }
  }

  async function saveGroupOrder(rows: ScheduleGroupOrder[]) {
    if (rows.length === 0) {
      return;
    }

    const { error } = await getSupabase()
      .from("schedule_group_orders")
      .upsert(rows as never[], { onConflict: "day_of_week,run_time,schedule_type,location" });

    if (error) {
      setErrorMessage(error.message);
      void loadSchedule({ showLoading: false });
    }
  }

  function getSameTimeEditableGroups(group: ScheduleGroup) {
    return visibleGroups.filter(
      (item) => formatTime(item.run_time) === formatTime(group.run_time) && !isAcademyDropGroup(item),
    );
  }

  function buildOrderRows(groupsToOrder: ScheduleGroup[]) {
    return groupsToOrder.map((group, index) => ({
      day_of_week: selectedDay,
      run_time: formatTime(group.run_time),
      schedule_type: group.schedule_type,
      location: group.location,
      sort_order: index,
    }));
  }

  function applyOrderRows(rows: ScheduleGroupOrder[]) {
    setGroupOrders((current) => {
      const replaceKeys = new Set(
        rows.map((row) => scheduleGroupOrderKey(selectedDay, row.run_time, row.schedule_type, row.location)),
      );
      const kept = current.filter(
        (row) => !replaceKeys.has(scheduleGroupOrderKey(selectedDay, row.run_time, row.schedule_type, row.location)),
      );
      return [...kept, ...rows];
    });
  }

  async function moveGroupByButton(group: ScheduleGroup, direction: -1 | 1) {
    const sameTimeGroups = getSameTimeEditableGroups(group);
    const currentIndex = sameTimeGroups.findIndex((item) => item.key === group.key);
    const nextIndex = currentIndex + direction;

    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= sameTimeGroups.length) {
      return;
    }

    const nextGroups = [...sameTimeGroups];
    const [moved] = nextGroups.splice(currentIndex, 1);
    nextGroups.splice(nextIndex, 0, moved);

    const rows = buildOrderRows(nextGroups);
    applyOrderRows(rows);
    await saveGroupOrder(rows);
  }

  return (
    <main className="min-h-screen bg-emerald-50 text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white shadow-sm">
        <header className="bg-emerald-700 px-5 pb-5 pt-4 text-white">
          <div className="flex items-center gap-3">
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
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-100">영어학원 차량 체크</p>
              <h1 className="text-xl font-bold">첫단추 차량시스템</h1>
            </div>
            <Link
              href="/admin?key=firststep2026"
              className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-black text-emerald-800 shadow-sm"
            >
              관리
            </Link>
          </div>
        </header>

        <section className="sticky top-0 z-10 border-b border-emerald-100 bg-white px-4 py-3">
          <label className="block">
            <span className="sr-only">학생 이름 검색</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="학생 이름 검색"
              className="h-12 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-base outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => setSelectedDay(day.value)}
                className={`h-10 rounded-lg text-sm font-bold transition ${
                  selectedDay === day.value
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-50 text-emerald-900"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-stone-500">{targetDate}</p>
          <button
            type="button"
            disabled={Boolean(searchTerm.trim())}
            onClick={() => setIsOrderEditMode((value) => !value)}
            className="mt-3 h-10 w-full rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-black text-emerald-800 disabled:bg-stone-100 disabled:text-stone-400"
          >
            {isOrderEditMode ? "순서편집 완료" : "순서편집"}
          </button>
        </section>

        <section className="flex-1 space-y-3 px-4 py-4">
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-8 text-center text-sm font-medium text-emerald-800">
              스케줄을 불러오는 중
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm font-medium text-stone-500">
              표시할 스케줄이 없습니다.
            </div>
          ) : (
            <>
              {pastGroups.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowPastSchedules((value) => !value)}
                  className="h-11 w-full rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-black text-emerald-800"
                >
                  {showPastSchedules ? "지난 일정 숨기기" : `지난 일정 보기 ${pastGroups.length}개`}
                </button>
              ) : null}

              {visibleGroups.length === 0 ? (
                <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm font-medium text-stone-500">
                  남은 스케줄이 없습니다.
                </div>
              ) : (
                visibleGroups.map((group) =>
                  isAcademyDropGroup(group) ? (
                    <AcademyDropRow key={group.key} group={group} />
                  ) : (
                    <div
                      key={group.key}
                      data-group-key={group.key}
                      onPointerDown={(event) => beginGroupPress(event, group)}
                      onPointerMove={moveGroupByPointer}
                      onPointerUp={() => void finishGroupDrag()}
                      onPointerCancel={() => void finishGroupDrag()}
                      className={draggingKey === group.key ? "scale-[0.98] opacity-70 transition" : "transition"}
                    >
                      <ScheduleCard
                        group={group}
                        isExpanded={expandedGroups.has(group.key)}
                        statusMap={statusMap}
                        isDragging={draggingKey === group.key}
                        isOrderEditMode={isOrderEditMode}
                        canMoveUp={getSameTimeEditableGroups(group).findIndex((item) => item.key === group.key) > 0}
                        canMoveDown={
                          getSameTimeEditableGroups(group).findIndex((item) => item.key === group.key) <
                          getSameTimeEditableGroups(group).length - 1
                        }
                        onMoveUp={() => void moveGroupByButton(group, -1)}
                        onMoveDown={() => void moveGroupByButton(group, 1)}
                        onToggleGroup={toggleGroup}
                        onToggleDone={toggleDone}
                      />
                    </div>
                  ),
                )
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function AcademyDropRow({ group }: { group: ScheduleGroup }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-2">
      <span className="w-16 shrink-0 text-lg font-black text-cyan-900">{formatTime(group.run_time)}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-black text-stone-900">첫단추영어학원 드랍</span>
    </div>
  );
}

function ScheduleCard({
  group,
  isExpanded,
  statusMap,
  isDragging,
  isOrderEditMode,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onToggleGroup,
  onToggleDone,
}: {
  group: ScheduleGroup;
  isExpanded: boolean;
  statusMap: Map<string, DailyScheduleStatus>;
  isDragging: boolean;
  isOrderEditMode: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleGroup: (key: string) => void;
  onToggleDone: (item: ScheduleItem) => void;
}) {
  const doneCount = group.items.filter((item) =>
    statusMap.get(
      statusKey(item.weekly_schedule_id, item.schedule_exception_id, item.target_date, item.student_id),
    )?.is_done,
  ).length;

  return (
    <article className={`overflow-hidden rounded-lg border bg-white shadow-sm ${
      isDragging ? "border-emerald-500 shadow-md" : "border-emerald-100"
    }`}>
      <div className="flex min-h-24 w-full items-center gap-3 px-4 py-4 text-left">
        <button
          type="button"
          disabled={isDragging || isOrderEditMode}
          onClick={() => onToggleGroup(group.key)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        >
          <div className="w-16 shrink-0 text-2xl font-black text-emerald-900">
            {formatTime(group.run_time)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2 py-1 text-xs font-bold ring-1 ${TYPE_CLASS[group.schedule_type]}`}>
                {TYPE_LABEL[group.schedule_type]}
              </span>
              <span className="text-sm font-bold text-stone-500">
                {doneCount}/{group.items.length} 완료
              </span>
            </div>
            <p className="mt-2 truncate text-base font-bold text-stone-950">{group.location}</p>
            <p className="text-sm font-medium text-stone-500">인원 {group.items.length}명</p>
          </div>
        </button>
        {isOrderEditMode ? (
          <span className="grid shrink-0 grid-cols-1 gap-1">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={(event) => {
                event.stopPropagation();
                onMoveUp();
              }}
              className="h-9 w-9 rounded-lg bg-emerald-50 text-lg font-black text-emerald-800 disabled:bg-stone-100 disabled:text-stone-300"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={(event) => {
                event.stopPropagation();
                onMoveDown();
              }}
              className="h-9 w-9 rounded-lg bg-emerald-50 text-lg font-black text-emerald-800 disabled:bg-stone-100 disabled:text-stone-300"
            >
              ↓
            </button>
          </span>
        ) : (
          <span className="text-xl font-bold text-emerald-700">{isExpanded ? "−" : "+"}</span>
        )}
      </div>

      {isExpanded ? (
        <div className="border-t border-emerald-100 bg-emerald-50/60">
          {group.items.map((item) => {
            const status = statusMap.get(
              statusKey(item.weekly_schedule_id, item.schedule_exception_id, item.target_date, item.student_id),
            );
            const isDone = Boolean(status?.is_done);

            return (
              <button
                key={`${item.source}-${item.id}-${item.student_id ?? "move"}`}
                type="button"
                onClick={() => onToggleDone(item)}
                className="flex min-h-14 w-full items-center gap-3 border-b border-emerald-100 px-4 py-3 text-left last:border-b-0"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm font-black ${
                    isDone
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-stone-300 bg-white text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-base font-bold ${isDone ? "text-emerald-800" : "text-stone-900"}`}>
                    {item.student_name ?? "이동"}
                  </span>
                  {item.memo ? <span className="block text-xs font-medium text-stone-500">{item.memo}</span> : null}
                </span>
                {isDone ? (
                  <span className="shrink-0 text-xs font-bold text-emerald-700">
                    {formatDoneTime(status?.done_at ?? null)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
