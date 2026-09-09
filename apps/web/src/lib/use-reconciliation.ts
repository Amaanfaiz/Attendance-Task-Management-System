'use client';

import { useQuery } from '@tanstack/react-query';
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

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h ${m}m`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
