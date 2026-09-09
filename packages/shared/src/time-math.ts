export interface Interval {
  start: Date;
  end: Date | null;
}

function overlapMinutes(a: Interval, bStart: Date, bEnd: Date): number {
  const aEnd = a.end ?? bEnd;
  const start = a.start > bStart ? a.start : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  const ms = end.getTime() - start.getTime();
  return ms > 0 ? ms / 60000 : 0;
}

/**
 * AC-004-003-03 / BR-008's other half: the same eligible-break-time figure
 * calculateNetWorkingMinutes subtracts, but returned on its own rather than
 * discarded — reports.service.ts's admin attendance report already computes
 * this independently and exposes it; the employee-facing reconciliation
 * endpoint (My Day) never did, so there was nowhere in the product a user
 * could see "your total break time today," found via live AC testing.
 */
export function calculateBreakMinutes(
  attendance: Interval,
  breaks: Interval[],
): number {
  return breaks.reduce((sum, b) => {
    const bEnd = b.end ?? new Date();
    return sum + overlapMinutes(attendance, b.start, bEnd);
  }, 0);
}

/** BR-008: Net working time = attendance elapsed time - eligible completed break time. */
export function calculateNetWorkingMinutes(
  attendance: Interval,
  breaks: Interval[],
): number {
  const attendanceEnd = attendance.end ?? new Date();
  const grossMinutes = Math.max(
    0,
    (attendanceEnd.getTime() - attendance.start.getTime()) / 60000,
  );
  const breakMinutes = calculateBreakMinutes(attendance, breaks);
  return Math.max(0, grossMinutes - breakMinutes);
}

/** BR-009: Task time = sum of valid non-overlapping active task segments. */
export function calculateTaskMinutes(segments: Interval[]): number {
  return segments.reduce((sum, seg) => {
    const end = seg.end ?? new Date();
    const ms = end.getTime() - seg.start.getTime();
    return sum + (ms > 0 ? ms / 60000 : 0);
  }, 0);
}

export interface ReconciliationResult {
  netWorkingMinutes: number;
  taskMinutes: number;
  breakMinutes: number;
  unallocatedMinutes: number;
  hasDataQualityException: boolean;
}

/** BR-010: Unallocated time = net working time - eligible task time. Never negative (AC-007-003-02). */
export function reconcile(
  attendance: Interval,
  breaks: Interval[],
  taskSegments: Interval[],
): ReconciliationResult {
  const netWorkingMinutes = calculateNetWorkingMinutes(attendance, breaks);
  const taskMinutes = calculateTaskMinutes(taskSegments);
  const breakMinutes = calculateBreakMinutes(attendance, breaks);
  const rawUnallocated = netWorkingMinutes - taskMinutes;
  return {
    netWorkingMinutes,
    taskMinutes,
    breakMinutes,
    unallocatedMinutes: Math.max(0, rawUnallocated),
    hasDataQualityException: rawUnallocated < -0.01,
  };
}

/**
 * Treats `dateStr` (YYYY-MM-DD) as a UTC calendar date and returns its [start, end)
 * boundary. All attendance/task timestamps are stored as server (UTC) time, so day
 * boundaries must be computed in UTC too — using local Date methods (e.g. setHours)
 * here would shift the boundary by the server's UTC offset and silently drop records
 * near midnight into the wrong day.
 */
export function getUtcDayRange(dateStr: string): { start: Date; end: Date } {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  return { start, end };
}

export function formatMinutesAsHm(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
