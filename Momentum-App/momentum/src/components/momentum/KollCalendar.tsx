"use client";

import { useMemo, useState } from "react";
import type { WorkTask, WorkTaskStatus } from "@/context/MomentumContext";

const WEEKDAY_LABELS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const MONTH_NAMES_SV = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];

function getTaskDate(task: WorkTask): Date | null {
  const dateStr = task.deadline ?? task.startDate ?? task.createdAt;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function getStatusAccent(status: WorkTaskStatus): string {
  switch (status) {
    case "todo":
      return "border-sky-700/40 bg-sky-900/20 text-sky-200";
    case "in_progress":
      return "border-amber-700/40 bg-amber-900/20 text-amber-200";
    case "done":
      return "border-emerald-700/40 bg-emerald-900/20 text-emerald-200";
  }
}

type KollCalendarProps = {
  workTasks: WorkTask[];
  onMoveTask?: (taskId: string, status: WorkTaskStatus) => void;
};

export function KollCalendar({ workTasks, onMoveTask }: KollCalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const today = useMemo(() => new Date(), []);
  today.setHours(0, 0, 0, 0);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, WorkTask[]>();
    for (const task of workTasks) {
      const d = getTaskDate(task);
      if (!d) continue;
      const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [workTasks]);

  const todayTasks = useMemo(() => {
    return workTasks.filter((task) => {
      const d = getTaskDate(task);
      return d && isSameCalendarDay(d, today);
    });
  }, [workTasks, today]);

  const calendarGrid = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);

    // Veckodag (1 = måndag i Sverige)
    let firstWeekday = start.getDay();
    if (firstWeekday === 0) firstWeekday = 7;
    firstWeekday -= 1;

    const days: Array<{ date: Date; tasks: WorkTask[] }> = [];
    const padStart = firstWeekday;
    const totalDays = end.getDate() + padStart;
    const rows = Math.ceil(totalDays / 7);

    for (let i = 0; i < padStart; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() - (padStart - i));
      days.push({ date: d, tasks: [] });
    }

    for (let d = 1; d <= end.getDate(); d++) {
      const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
      const tasks = tasksByDate.get(key) ?? [];
      days.push({ date, tasks });
    }

    const remainder = rows * 7 - days.length;
    for (let i = 0; i < remainder; i++) {
      const last = days[days.length - 1]?.date;
      const next = last ? new Date(last) : new Date(end);
      next.setDate(next.getDate() + 1);
      days.push({ date: next, tasks: [] });
    }

    return days;
  }, [viewDate, tasksByDate]);

  const prevMonth = () => setViewDate((d) => addMonths(d, -1));
  const nextMonth = () => setViewDate((d) => addMonths(d, 1));
  const goToToday = () => setViewDate(new Date());

  const monthTitle = `${MONTH_NAMES_SV[viewDate.getMonth()]} ${viewDate.getFullYear()}`;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-zinc-100">
          Koll-kalender
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="rounded-lg border border-violet-600/50 px-3 py-1.5 text-sm text-violet-300 transition hover:bg-violet-900/30"
          >
            Idag
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            →
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-zinc-400">{monthTitle}</p>

      {/* Veckodagar */}
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      {/* Kalendergrid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarGrid.map(({ date, tasks }, idx) => {
          const isToday = isSameCalendarDay(date, today);
          const isCurrentMonth = date.getMonth() === viewDate.getMonth();
          return (
            <div
              key={idx}
              className={`min-h-[72px] rounded-lg border p-1.5 text-sm ${
                isCurrentMonth
                  ? "border-zinc-700/60 bg-zinc-900/40"
                  : "border-zinc-800/40 bg-zinc-950/60 text-zinc-600"
              } ${isToday ? "ring-1 ring-violet-500/60" : ""}`}
            >
              <span
                className={`inline-block rounded px-1 ${
                  isToday ? "bg-violet-600/40 font-semibold text-violet-200" : ""
                }`}
              >
                {date.getDate()}
              </span>
              <ul className="mt-1 space-y-1">
                {tasks.slice(0, 2).map((task) => (
                  <li
                    key={task.id}
                    className={`truncate rounded border px-1.5 py-0.5 text-xs ${getStatusAccent(task.status)}`}
                    title={task.title}
                  >
                    {task.title}
                  </li>
                ))}
                {tasks.length > 2 && (
                  <li className="text-xs text-zinc-500">+{tasks.length - 2}</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Dagens agenda */}
      <div className="mt-6 border-t border-zinc-800 pt-5">
        <h3 className="text-base font-medium text-zinc-100">
          Dagens agenda
        </h3>
        {todayTasks.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">
            Inga uppgifter med deadline eller startdatum idag.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {todayTasks.map((task) => (
              <li
                key={task.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${getStatusAccent(task.status)}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{task.title}</p>
                  <p className="text-xs opacity-80">
                    {task.subtaskCompleted}/{task.subtaskTotal} delsteg
                  </p>
                </div>
                {onMoveTask && task.status !== "done" && (
                  <button
                    type="button"
                    onClick={() => onMoveTask(task.id, "done")}
                    className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-xs transition hover:bg-white/10"
                  >
                    Markera klar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
