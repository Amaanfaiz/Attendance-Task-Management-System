'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { buildSessionTimeline, formatMinutes } from '@/lib/use-reconciliation';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';

interface BreakDetail {
  id: string;
  startAt: string;
  endAt: string | null;
}

interface TaskTimeEntryDetail {
  id: string;
  startAt: string;
  endAt: string | null;
  task: { id: string; title: string };
}

interface SessionDetail {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: string;
  breaks: BreakDetail[];
  taskTimeEntries: TaskTimeEntryDetail[];
}

function durationMinutes(startAt: string, endAt: string | null): number {
  const end = endAt ? new Date(endAt).getTime() : Date.now();
  return Math.max(0, (end - new Date(startAt).getTime()) / 60000);
}

// SCR-006 Attendance Day Detail, as a drawer opened from both My Attendance
// History (employee, own record - canRequestCorrection) and Admin Attendance
// Logs (canRequestCorrection omitted, since that's not the admin's own record
// to self-correct). Same GET /attendance/:id and buildSessionTimeline reuse
// the Live Attendance drawer already established for reconciliation math.
export function SessionDetailDrawer({
  sessionId,
  onClose,
  canRequestCorrection = false,
}: {
  sessionId: string;
  onClose: () => void;
  canRequestCorrection?: boolean;
}) {
  const { data: session } = useQuery({
    queryKey: ['attendance', 'session', sessionId],
    queryFn: () => api.get<SessionDetail>(`/attendance/${sessionId}`),
  });

  const built = session ? buildSessionTimeline(session) : null;
  const isComplete = session?.status === 'COMPLETED' && !session.breaks.some((b) => !b.endAt);

  return (
    <Drawer
      open
      onClose={onClose}
      title={session ? new Date(session.clockInAt).toLocaleDateString() : 'Attendance detail'}
      subtitle={
        session
          ? `${new Date(session.clockInAt).toLocaleTimeString()} → ${session.clockOutAt ? new Date(session.clockOutAt).toLocaleTimeString() : 'still active'}`
          : undefined
      }
    >
      {!session || !built ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div>{isComplete ? <Badge color="green">Complete</Badge> : <Badge color="amber">Incomplete</Badge>}</div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Net work</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-slate-900">{formatMinutes(built.reconciliation.netWorkingMinutes)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Break time</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-slate-900">{formatMinutes(built.reconciliation.breakMinutes)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Task time</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-slate-900">{formatMinutes(built.reconciliation.taskMinutes)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Unallocated</p>
              <p className={'font-mono text-lg font-semibold tabular-nums ' + (built.reconciliation.hasDataQualityException ? 'text-red-600' : 'text-slate-900')}>
                {formatMinutes(built.reconciliation.unallocatedMinutes)}
              </p>
            </div>
          </div>
          {built.reconciliation.hasDataQualityException && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
              Data quality exception — task time appears to exceed attendance time.
            </p>
          )}

          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Breaks</p>
            {session.breaks.length === 0 ? (
              <p className="text-sm text-slate-500">No breaks taken.</p>
            ) : (
              <ul className="space-y-1.5">
                {session.breaks.map((b) => (
                  <li key={b.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {new Date(b.startAt).toLocaleTimeString()} → {b.endAt ? new Date(b.endAt).toLocaleTimeString() : '—'}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono tabular-nums text-slate-600">{formatMinutes(durationMinutes(b.startAt, b.endAt))}</span>
                      {b.endAt ? <Badge color="green">Completed</Badge> : <Badge color="amber">Incomplete</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Daily activity timeline</p>
            {built.timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No activity recorded.</p>
            ) : (
              <ul className="space-y-2">
                {built.timeline.map((event, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-sm">
                    <span
                      className={
                        'h-2 w-2 shrink-0 rounded-full ' +
                        (event.type === 'ATTENDANCE' ? 'bg-green-500' : event.type === 'BREAK' ? 'bg-amber-500' : 'bg-blue-500')
                      }
                    />
                    <span className="w-16 shrink-0 text-slate-500">
                      {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-medium text-slate-800">{event.label}</span>
                    <span className="text-slate-500">
                      {event.end ? `→ ${new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '(ongoing)'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canRequestCorrection && (
            <div className="border-t border-slate-200 pt-4">
              <Link href="/corrections" className="text-sm text-brand-700 hover:underline">
                Request a correction for this session
              </Link>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
