'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pause, Square } from 'lucide-react';
import { TaskStatus } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useAttendanceState } from '@/lib/use-attendance-state';
import { useElapsedSeconds, formatDuration } from '@/lib/use-elapsed';
import { useMyTasks } from '@/lib/use-tasks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['attendance'] });
  queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
}

// Stitch's redesign calls for the global bar to carry the same Pause/Switch/Stop
// controls My Day already has on the active task, so a timer can be managed from
// any page - not a new capability, just this bar reusing the existing
// /task-timers/* mutations instead of only displaying status.
export function GlobalTimerBar() {
  const queryClient = useQueryClient();
  const { data } = useAttendanceState();
  const { data: tasks } = useMyTasks();
  const [error, setError] = useState<string | null>(null);
  const timerSeconds = useElapsedSeconds(data?.activeTimer?.startAt);
  const sessionSeconds = useElapsedSeconds(
    data?.session && data.session.status !== 'COMPLETED' ? data.session.clockInAt : null,
  );

  const timerPause = useMutation({ mutationFn: () => api.post('/task-timers/pause') });
  const timerStop = useMutation({ mutationFn: () => api.post('/task-timers/stop') });
  const timerSwitch = useMutation({ mutationFn: (taskId: string) => api.post('/task-timers/switch', { taskId }) });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      invalidateAll(queryClient);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  if (!data || data.state === 'CLOCKED_OUT') {
    return (
      <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
        <Badge color="slate" dot>Clocked out</Badge>
      </div>
    );
  }

  const activeTaskId = data.activeTimer?.taskId;
  const switchOptions = (tasks ?? []).filter(
    (t) => t.id !== activeTaskId && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED,
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm">
      {data.state === 'ON_BREAK' ? (
        <Badge color="amber" dot>On break</Badge>
      ) : (
        <Badge color="green" dot>Working · {formatDuration(sessionSeconds)}</Badge>
      )}
      {data.activeTimer ? (
        <>
          <span className="flex items-center gap-1.5 font-medium text-slate-800">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" />
            {data.activeTimer.task.title} · {formatDuration(timerSeconds)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Pause task timer"
              variant="secondary"
              className="px-2 py-1"
              icon={<Pause size={14} aria-hidden="true" />}
              onClick={() => run(() => timerPause.mutateAsync())}
              loading={timerPause.isPending}
            />
            <Button
              aria-label="Stop task timer"
              variant="danger"
              className="px-2 py-1"
              icon={<Square size={14} aria-hidden="true" />}
              onClick={() => run(() => timerStop.mutateAsync())}
              loading={timerStop.isPending}
            />
            {switchOptions.length > 0 && (
              <Select
                uiSize="xs"
                value=""
                aria-label="Switch to another task"
                onChange={(e) => {
                  const taskId = e.target.value;
                  if (taskId) run(() => timerSwitch.mutateAsync(taskId));
                }}
              >
                <option value="" disabled>
                  Switch…
                </option>
                {switchOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </>
      ) : (
        data.state === 'WORKING' && <span className="text-slate-600">No task timer running</span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
