'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskStatus } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useAttendanceState } from '@/lib/use-attendance-state';
import { useReconciliation, formatMinutes, todayIso } from '@/lib/use-reconciliation';
import { useMyTasks } from '@/lib/use-tasks';
import { useElapsedSeconds, formatDuration } from '@/lib/use-elapsed';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['attendance'] });
  queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
}

export default function MyDayPage() {
  const queryClient = useQueryClient();
  const today = todayIso();
  const { data: attendance } = useAttendanceState();
  const { data: summary } = useReconciliation(today);
  const { data: tasks } = useMyTasks();
  const [error, setError] = useState<string | null>(null);
  const [clockOutBlocked, setClockOutBlocked] = useState<{
    activeBreak: unknown;
    activeTimer: { task: { title: string } } | null;
  } | null>(null);

  const timerSeconds = useElapsedSeconds(attendance?.activeTimer?.startAt);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      invalidateAll(queryClient);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const clockIn = useMutation({ mutationFn: () => api.post('/attendance/clock-in') });
  const clockOut = useMutation({
    mutationFn: (confirm: boolean) => api.post<{ requiresConfirmation: boolean } & Record<string, unknown>>(
      '/attendance/clock-out',
      { confirm },
    ),
  });
  const breakStart = useMutation({ mutationFn: () => api.post('/breaks/start') });
  const breakEnd = useMutation({ mutationFn: () => api.post('/breaks/end') });
  const timerStart = useMutation({ mutationFn: (taskId: string) => api.post('/task-timers/start', { taskId }) });
  const timerResume = useMutation({ mutationFn: (taskId: string) => api.post('/task-timers/resume', { taskId }) });
  const timerPause = useMutation({ mutationFn: () => api.post('/task-timers/pause') });
  const timerStop = useMutation({ mutationFn: () => api.post('/task-timers/stop') });
  const timerSwitch = useMutation({ mutationFn: (taskId: string) => api.post('/task-timers/switch', { taskId }) });

  const handleClockOut = async () => {
    setError(null);
    try {
      const result = await clockOut.mutateAsync(false);
      if ((result as { requiresConfirmation: boolean }).requiresConfirmation) {
        setClockOutBlocked(result as never);
      } else {
        invalidateAll(queryClient);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  const confirmClockOut = () =>
    run(async () => {
      await clockOut.mutateAsync(true);
      setClockOutBlocked(null);
    });

  const isWorking = attendance?.state === 'WORKING';
  const isOnBreak = attendance?.state === 'ON_BREAK';
  const isClockedOut = !attendance || attendance.state === 'CLOCKED_OUT';
  const activeTaskId = attendance?.activeTimer?.taskId;
  const eligibleTasks = (tasks ?? []).filter(
    (t) => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">My Day</h1>
        <span className="text-sm text-slate-500">{today}</span>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {clockOutBlocked && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-2 font-medium">
            You still have {clockOutBlocked.activeTimer ? 'an active task timer' : ''}
            {clockOutBlocked.activeTimer && clockOutBlocked.activeBreak ? ' and ' : ''}
            {clockOutBlocked.activeBreak ? 'an active break' : ''} running.
          </p>
          <p className="mb-3">Clocking out will stop them both at the same timestamp. Continue?</p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={confirmClockOut}>
              Stop and clock out
            </Button>
            <Button variant="secondary" onClick={() => setClockOutBlocked(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Attendance</CardTitle>
          <div className="mb-4 flex items-center gap-2">
            {isClockedOut && <Badge color="slate">Clocked out</Badge>}
            {isWorking && <Badge color="green">Working</Badge>}
            {isOnBreak && <Badge color="amber">On break</Badge>}
            {attendance?.session && (
              <span className="text-sm text-slate-500">
                since {new Date(attendance.session.clockInAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isClockedOut && (
              <Button onClick={() => run(() => clockIn.mutateAsync())} loading={clockIn.isPending}>
                Clock In
              </Button>
            )}
            {!isClockedOut && (
              <Button variant="danger" onClick={handleClockOut} loading={clockOut.isPending}>
                Clock Out
              </Button>
            )}
            {isWorking && (
              <Button variant="secondary" onClick={() => run(() => breakStart.mutateAsync())} loading={breakStart.isPending}>
                Start Break
              </Button>
            )}
            {isOnBreak && (
              <Button variant="secondary" onClick={() => run(() => breakEnd.mutateAsync())} loading={breakEnd.isPending}>
                End Break
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Active Task</CardTitle>
          {attendance?.activeTimer ? (
            <>
              <p className="mb-1 text-lg font-medium text-slate-900">{attendance.activeTimer.task.title}</p>
              <p className="mb-4 font-mono text-2xl text-slate-700">{formatDuration(timerSeconds)}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => run(() => timerPause.mutateAsync())} loading={timerPause.isPending}>
                  Pause
                </Button>
                <Button variant="danger" onClick={() => run(() => timerStop.mutateAsync())} loading={timerStop.isPending}>
                  Stop
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {isWorking ? 'No task timer running. Start one below.' : 'Clock in (and end any break) to start a task timer.'}
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>Today's Totals</CardTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Worked" value={summary ? formatMinutes(summary.netWorkingMinutes) : '—'} />
          <Stat label="Task time" value={summary ? formatMinutes(summary.taskMinutes) : '—'} />
          <Stat
            label="Unallocated"
            value={summary ? formatMinutes(summary.unallocatedMinutes) : '—'}
            warn={summary?.hasDataQualityException}
          />
          <Stat label="Sessions" value={summary ? String(summary.sessionCount) : '—'} />
        </div>
        {summary?.hasDataQualityException && (
          <p className="mt-3 text-xs text-red-600">
            Data quality exception detected — task time appears to exceed attendance time. Contact an administrator.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>My Tasks</CardTitle>
        <ul className="divide-y divide-slate-100">
          {eligibleTasks.length === 0 && <li className="py-3 text-sm text-slate-500">No tasks assigned.</li>}
          {eligibleTasks.map((task) => {
            const isActive = task.id === activeTaskId;
            return (
              <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {task.status.replace('_', ' ')} · {task.priority}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isActive ? (
                    <Badge color="blue">Active</Badge>
                  ) : isWorking ? (
                    <>
                      {attendance?.activeTimer ? (
                        <Button
                          variant="secondary"
                          onClick={() => run(() => timerSwitch.mutateAsync(task.id))}
                          loading={timerSwitch.isPending}
                        >
                          Switch to this
                        </Button>
                      ) : task.status === TaskStatus.TO_DO ? (
                        <Button onClick={() => run(() => timerStart.mutateAsync(task.id))} loading={timerStart.isPending}>
                          Start
                        </Button>
                      ) : (
                        <Button onClick={() => run(() => timerResume.mutateAsync(task.id))} loading={timerResume.isPending}>
                          Resume
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle>Today's Timeline</CardTitle>
        {!summary || summary.timeline.length === 0 ? (
          <p className="text-sm text-slate-500">No activity recorded yet today.</p>
        ) : (
          <ul className="space-y-2">
            {summary.timeline.map((event, idx) => (
              <li key={idx} className="flex items-center gap-3 text-sm">
                <span
                  className={
                    'h-2 w-2 rounded-full ' +
                    (event.type === 'ATTENDANCE' ? 'bg-green-500' : event.type === 'BREAK' ? 'bg-amber-500' : 'bg-blue-500')
                  }
                />
                <span className="w-16 shrink-0 text-slate-500">
                  {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="font-medium text-slate-800">{event.label}</span>
                <span className="text-slate-400">
                  {event.end
                    ? `→ ${new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : '(ongoing)'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={'text-lg font-semibold ' + (warn ? 'text-red-600' : 'text-slate-900')}>{value}</p>
    </div>
  );
}
