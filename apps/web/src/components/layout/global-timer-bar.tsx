'use client';

import { useAttendanceState } from '@/lib/use-attendance-state';
import { useElapsedSeconds, formatDuration } from '@/lib/use-elapsed';
import { Badge } from '@/components/ui/badge';

export function GlobalTimerBar() {
  const { data } = useAttendanceState();
  const timerSeconds = useElapsedSeconds(data?.activeTimer?.startAt);
  const sessionSeconds = useElapsedSeconds(
    data?.session && data.session.status !== 'COMPLETED' ? data.session.clockInAt : null,
  );

  if (!data || data.state === 'CLOCKED_OUT') {
    return (
      <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
        <Badge color="slate">Clocked out</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-100 px-3 py-1.5 text-sm">
      {data.state === 'ON_BREAK' ? (
        <Badge color="amber">On break</Badge>
      ) : (
        <Badge color="green">Working · {formatDuration(sessionSeconds)}</Badge>
      )}
      {data.activeTimer ? (
        <span className="flex items-center gap-1.5 font-medium text-slate-800">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" />
          {data.activeTimer.task.title} · {formatDuration(timerSeconds)}
        </span>
      ) : (
        data.state === 'WORKING' && <span className="text-slate-600">No task timer running</span>
      )}
    </div>
  );
}
