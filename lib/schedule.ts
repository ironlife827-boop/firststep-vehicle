import type {
  DailyScheduleStatus,
  ScheduleException,
  ScheduleGroup,
  ScheduleGroupOrder,
  ScheduleItem,
  WeeklySchedule,
} from "./types";

export const DAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
];

export const TYPE_LABEL = {
  PICKUP: "픽업",
  DROP: "드랍",
  DROP_START: "드랍 출발",
  MOVE: "이동",
} as const;

export const ACADEMY_DROP_LOCATION = "첫단추영어학원";

export function isAcademyDropItem(item: Pick<ScheduleItem, "student_id" | "schedule_type" | "location">) {
  return item.student_id === null && item.schedule_type === "DROP" && item.location === ACADEMY_DROP_LOCATION;
}

export function isAcademyDropGroup(group: Pick<ScheduleGroup, "items" | "schedule_type" | "location">) {
  return group.schedule_type === "DROP" && group.location === ACADEMY_DROP_LOCATION && group.items.every(isAcademyDropItem);
}

export function getSchedulePriority(item: Pick<ScheduleItem | ScheduleGroup, "schedule_type" | "location">) {
  if (item.schedule_type === "DROP" && item.location === ACADEMY_DROP_LOCATION) {
    return 0;
  }

  if (item.schedule_type === "DROP_START") {
    return 1;
  }

  if (item.schedule_type === "PICKUP") {
    return 2;
  }

  if (item.schedule_type === "DROP") {
    return 3;
  }

  return 4;
}

export function scheduleGroupOrderKey(
  dayOfWeek: number,
  runTime: string,
  scheduleType: string,
  location: string,
) {
  return `${dayOfWeek}|${formatTime(runTime)}|${scheduleType}|${location}`;
}

function getSavedGroupOrder(
  group: Pick<ScheduleGroup, "run_time" | "schedule_type" | "location">,
  orders: ScheduleGroupOrder[],
  dayOfWeek: number,
) {
  const key = scheduleGroupOrderKey(dayOfWeek, group.run_time, group.schedule_type, group.location);
  return orders.find((order) =>
    scheduleGroupOrderKey(dayOfWeek, order.run_time, order.schedule_type, order.location) === key
  )?.sort_order;
}

export function getTodayDayOfWeek() {
  const day = new Date().getDay();
  if (day >= 1 && day <= 5) {
    return day;
  }
  return 1;
}

export function getDateForWeekday(dayOfWeek: number) {
  const today = new Date();
  const jsDay = today.getDay() === 0 ? 7 : today.getDay();
  const target = new Date(today);
  target.setDate(today.getDate() + (dayOfWeek - jsDay));
  return formatDate(target);
}

export function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTime(time: string) {
  return time.slice(0, 5);
}

export function formatDoneTime(doneAt: string | null) {
  if (!doneAt) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(doneAt));
}

export function buildScheduleItems(
  weeklySchedules: WeeklySchedule[],
  exceptions: ScheduleException[],
  targetDate: string,
) {
  const canceledWeeklyIds = new Set(
    exceptions
      .filter((item) => item.exception_type === "CANCEL" && item.weekly_schedule_id)
      .map((item) => item.weekly_schedule_id as string),
  );

  const changedWeeklyIds = new Set(
    exceptions
      .filter((item) => item.exception_type === "CHANGE" && item.weekly_schedule_id)
      .map((item) => item.weekly_schedule_id as string),
  );

  const weeklyItems: ScheduleItem[] = weeklySchedules
    .filter((item) => item.schedule_type !== "MOVE")
    .filter((item) => !canceledWeeklyIds.has(item.id) && !changedWeeklyIds.has(item.id))
    .map((item) => ({
      id: item.id,
      source: "weekly",
      weekly_schedule_id: item.id,
      schedule_exception_id: null,
      student_id: item.student_id,
      student_name: item.students?.name ?? null,
      run_time: item.run_time,
      schedule_type: item.schedule_type,
      location: item.location,
      target_date: targetDate,
      memo: item.students?.memo ?? null,
    }));

  const exceptionItems: ScheduleItem[] = exceptions.flatMap((item) => {
    if (
      (item.exception_type !== "CHANGE" && item.exception_type !== "ADD") ||
      !item.run_time ||
      !item.schedule_type ||
      item.schedule_type === "MOVE" ||
      !item.location
    ) {
      return [];
    }

    return [
      {
        id: item.id,
        source: "exception",
        weekly_schedule_id: item.weekly_schedule_id,
        schedule_exception_id: item.id,
        student_id: item.student_id,
        student_name: item.students?.name ?? null,
        run_time: item.run_time,
        schedule_type: item.schedule_type,
        location: item.location,
        target_date: item.target_date,
        memo: item.memo,
      },
    ];
  });

  return [...weeklyItems, ...exceptionItems].sort((a, b) => {
    const timeCompare = formatTime(a.run_time).localeCompare(formatTime(b.run_time));
    if (timeCompare !== 0) {
      return timeCompare;
    }
    const priorityCompare = getSchedulePriority(a) - getSchedulePriority(b);
    if (priorityCompare !== 0) {
      return priorityCompare;
    }
    const locationCompare = a.location.localeCompare(b.location, "ko");
    if (locationCompare !== 0) {
      return locationCompare;
    }
    return (a.student_name ?? "").localeCompare(b.student_name ?? "", "ko");
  });
}

export function filterItems(items: ScheduleItem[], searchTerm: string) {
  const keyword = searchTerm.trim().toLocaleLowerCase("ko-KR");
  if (!keyword) {
    return items;
  }

  return items.filter((item) =>
    item.student_name?.toLocaleLowerCase("ko-KR").includes(keyword),
  );
}

export function groupScheduleItems(
  items: ScheduleItem[],
  orders: ScheduleGroupOrder[] = [],
  dayOfWeek = 1,
) {
  const groupMap = new Map<string, ScheduleGroup>();

  for (const item of items) {
    const key = `${formatTime(item.run_time)}-${item.schedule_type}-${item.location}`;
    const group = groupMap.get(key);

    if (group) {
      group.items.push(item);
      continue;
    }

    groupMap.set(key, {
      key,
      run_time: item.run_time,
      schedule_type: item.schedule_type,
      location: item.location,
      items: [item],
    });
  }

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) =>
        (a.student_name ?? "").localeCompare(b.student_name ?? "", "ko"),
      ),
    }))
    .sort((a, b) => {
      const timeCompare = formatTime(a.run_time).localeCompare(formatTime(b.run_time));
      if (timeCompare !== 0) {
        return timeCompare;
      }

      const priorityCompare = getSchedulePriority(a) - getSchedulePriority(b);
      if (priorityCompare !== 0) {
        return priorityCompare;
      }

      const orderA = getSavedGroupOrder(a, orders, dayOfWeek);
      const orderB = getSavedGroupOrder(b, orders, dayOfWeek);
      if (orderA !== undefined || orderB !== undefined) {
        return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
      }

      return a.location.localeCompare(b.location, "ko");
    });
}

export function isPastScheduleTime(targetDate: string, runTime: string) {
  const now = new Date();
  const today = formatDate(now);

  if (targetDate !== today) {
    return false;
  }

  const PAST_DELAY_MINUTES = 15;

  const [hour, minute] = formatTime(runTime).split(":").map(Number);
  const scheduleMinutes = hour * 60 + minute;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return currentMinutes >= scheduleMinutes + PAST_DELAY_MINUTES;
}

export function statusKey(
  weeklyScheduleId: string | null,
  scheduleExceptionId: string | null,
  targetDate: string,
  studentId: string | null,
) {
  return `${weeklyScheduleId ?? scheduleExceptionId}:${targetDate}:${studentId ?? "move"}`;
}

export function buildStatusMap(statuses: DailyScheduleStatus[]) {
  const map = new Map<string, DailyScheduleStatus>();

  for (const status of statuses) {
    map.set(
      statusKey(
        status.weekly_schedule_id,
        status.schedule_exception_id,
        status.target_date,
        status.student_id,
      ),
      status,
    );
  }

  return map;
}
