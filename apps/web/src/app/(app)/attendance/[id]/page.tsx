'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface BreakDetail {
  id: string;
  startAt: string;
  endAt: string | null;
  status: string;
}

interface TaskTimeEntryDetail {
  id: string;
  startAt: string;
  endAt: string | null;
  status: string;
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

// SCR-006 Attendance Day Detail / Timeline - named in the SRS but never built.
// The history list (SCR-005) only ever showed a session's totals; there was no
// screen for AC-004-005-01/02 (per-break start/end/duration, incomplete breaks
// clearly marked) even though GET /attendance/:id already returned everything
// needed.
export default function AttendanceDayDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data: session, isLoading } = useQuery({
    queryKey: ['attendance', 'session', params.id],
    queryFn: () => api.get<SessionDetail>(`/attendance/${params.id}`),
  });

  if (isLoading || !session) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <button onClick={() => router.push('/attendance')} className="text-sm text-slate-500 hover:underline">
        ← Back to Attendance History
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          {new Date(session.clockInAt).toLocaleDateString()}
        </h1>
        {session.status === 'COMPLETED' ? (
          <Badge color="green">Complete</Badge>
        ) : (
          <Badge color="amber">Incomplete</Badge>
        )}
      </div>

      <Card>
        <CardTitle>Attendance</CardTitle>
        <p className="text-sm text-slate-700">
          Clocked in {new Date(session.clockInAt).toLocaleTimeString()} &middot; Clocked out{' '}
          {session.clockOutAt ? new Date(session.clockOutAt).toLocaleTimeString() : 'still active'}
        </p>
      </Card>

      <Card>
        <CardTitle>Breaks</CardTitle>
        {session.breaks.length === 0 && <p className="text-sm text-slate-500">No breaks taken.</p>}
        {session.breaks.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">Duration</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {session.breaks.map((b) => (
                <tr key={b.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{new Date(b.startAt).toLocaleTimeString()}</td>
                  <td className="py-2 pr-4">{b.endAt ? new Date(b.endAt).toLocaleTimeString() : '—'}</td>
                  <td className="py-2 pr-4">{formatMinutes(durationMinutes(b.startAt, b.endAt))}</td>
                  <td className="py-2 pr-4">
                    {b.endAt ? <Badge color="green">Completed</Badge> : <Badge color="amber">Active (incomplete)</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardTitle>Task time</CardTitle>
        {session.taskTimeEntries.length === 0 && <p className="text-sm text-slate-500">No task time recorded.</p>}
        {session.taskTimeEntries.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Task</th>
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">Duration</th>
              </tr>
            </thead>
            <tbody>
              {session.taskTimeEntries.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{t.task.title}</td>
                  <td className="py-2 pr-4">{new Date(t.startAt).toLocaleTimeString()}</td>
                  <td className="py-2 pr-4">{t.endAt ? new Date(t.endAt).toLocaleTimeString() : '—'}</td>
                  <td className="py-2 pr-4">{formatMinutes(durationMinutes(t.startAt, t.endAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
