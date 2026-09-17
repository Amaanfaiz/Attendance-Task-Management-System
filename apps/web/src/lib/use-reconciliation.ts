'use client';

import { useQuery } from '@tanstack/react-query';
import { reconcile, type ReconciliationResult } from '@atms/shared';
import { api } from './api-client';

export interface TimelineEvent {
  type: 'ATTENDANCE' | 'BREAK' | 'TASK';
  label: string;
  start: string;
  end: string | null;
}

export interface DailySummary {
  date: string;
  netWorkingMinutes: number;
  taskMinutes: number;
  breakMinutes: number;
  unallocatedMinutes: number;
  hasDataQualityException: boolean;
  timeline: TimelineEvent[];
  sessionCount: number;
}

export function useReconciliation(date: string) {
  return useQuery({
    queryKey: ['reconciliation', 'me', date],
    queryFn: () => api.get<DailySummary>('/reconciliation/me', { date }),
    refetchInterval: 30_000,
  });
}

// AC-007-005-03: the timeline only ever rendered ATTENDANCE/BREAK/TASK events -
// an unallocated gap (clocked in, not on break, no task running) was only
// detectable by mentally comparing timestamps across rows, never shown itself.
// Reconstructs each attendance session's span from the flat, time-sorted
// timeline, then finds the portions of it not covered by any break/task event.
export interface TimelineGap {
  type: 'UNALLOCATED';
  label: string;
  start: string;
  end: string | null;
}

export function computeTimelineGaps(timeline: TimelineEvent[]): TimelineGap[] {
  const gaps: TimelineGap[] = [];
  let sessionStart: number | null = null;
  let sessionEnd: number | null = null;
  let covered: Array<[number, number]> = [];

  const flushSession = () => {
    if (sessionStart == null) return;
    const end = sessionEnd ?? Date.now();
    const merged = covered
      .slice()
      .sort((a, b) => a[0] - b[0])
      .reduce<Array<[number, number]>>((acc, [s, e]) => {
        const last = acc[acc.length - 1];
        if (last && s <= last[1]) {
          last[1] = Math.max(last[1], e);
        } else {
          acc.push([s, e]);
        }
        return acc;
      }, []);
    let cursor = sessionStart!;
    for (const [s, e] of merged) {
      if (s > cursor) {
        gaps.push({ type: 'UNALLOCATED', label: 'Unallocated', start: new Date(cursor).toISOString(), end: new Date(s).toISOString() });
      }
      cursor = Math.max(cursor, e);
    }
    if (cursor < end) {
      gaps.push({
        type: 'UNALLOCATED',
        label: 'Unallocated',
        start: new Date(cursor).toISOString(),
        end: sessionEnd == null ? null : new Date(end).toISOString(),
      });
    }
  };

  for (const event of timeline) {
    if (event.type === 'ATTENDANCE') {
      flushSession();
      sessionStart = new Date(event.start).getTime();
      sessionEnd = event.end ? new Date(event.end).getTime() : null;
      covered = [];
    } else if (sessionStart != null) {
      const s = new Date(event.start).getTime();
      const e = event.end ? new Date(event.end).getTime() : Date.now();
      covered.push([s, e]);
    }
  }
  flushSession();

  return gaps;
}

interface SessionLike {
  clockInAt: string;
  clockOutAt: string | null;
  breaks: { startAt: string; endAt: string | null }[];
  taskTimeEntries: { startAt: string; endAt: string | null; task: { title: string } }[];
}

// Reproduces reconciliation.service.ts's getDailySummary transformation for a
// single already-fetched session, so an admin viewing someone else's record
// (no /reconciliation/:userId endpoint exists, nor should one for this) gets
// the identical BR-008/009/010 numbers and timeline shape "my day" does, from
// data the admin-accessible GET /attendance/:id already returns.
export function buildSessionTimeline(session: SessionLike): {
  timeline: TimelineEvent[];
  reconciliation: ReconciliationResult;
} {
  const attendanceInterval = { start: new Date(session.clockInAt), end: session.clockOutAt ? new Date(session.clockOutAt) : null };
  const breakIntervals = session.breaks.map((b) => ({ start: new Date(b.startAt), end: b.endAt ? new Date(b.endAt) : null }));
  const taskIntervals = session.taskTimeEntries.map((t) => ({ start: new Date(t.startAt), end: t.endAt ? new Date(t.endAt) : null }));

  const reconciliation = reconcile(attendanceInterval, breakIntervals, taskIntervals);

  const timeline: TimelineEvent[] = [
    { type: 'ATTENDANCE' as const, label: 'Clocked in', start: session.clockInAt, end: session.clockOutAt },
    ...session.breaks.map((b) => ({ type: 'BREAK' as const, label: 'Break', start: b.startAt, end: b.endAt })),
    ...session.taskTimeEntries.map((t) => ({ type: 'TASK' as const, label: t.task.title, start: t.startAt, end: t.endAt })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return { timeline, reconciliation };
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h ${m}m`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
