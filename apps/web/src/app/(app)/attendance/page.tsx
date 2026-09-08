'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface BreakRow {
  id: string;
  startAt: string;
  endAt: string | null;
}

interface SessionRow {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  breaks: BreakRow[];
}

function netMinutes(session: SessionRow): number {
  const end = session.clockOutAt ? new Date(session.clockOutAt).getTime() : Date.now();
  const gross = (end - new Date(session.clockInAt).getTime()) / 60000;
  const breaks = session.breaks.reduce((sum, b) => {
    const bEnd = b.endAt ? new Date(b.endAt).getTime() : Date.now();
    return sum + (bEnd - new Date(b.startAt).getTime()) / 60000;
  }, 0);
  return Math.max(0, gross - breaks);
}

export default function AttendanceHistoryPage() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['attendance', 'me', 'history'],
    queryFn: () => api.get<SessionRow[]>('/attendance/me'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Attendance History</h1>
      <Card>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Attendance history table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Clock In</th>
                <th className="py-2 pr-4">Clock Out</th>
                <th className="py-2 pr-4">Breaks</th>
                <th className="py-2 pr-4">Net Work</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {(sessions ?? []).map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{new Date(s.clockInAt).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">{new Date(s.clockInAt).toLocaleTimeString()}</td>
                  <td className="py-2 pr-4">{s.clockOutAt ? new Date(s.clockOutAt).toLocaleTimeString() : '—'}</td>
                  <td className="py-2 pr-4">{s.breaks.length}</td>
                  <td className="py-2 pr-4">{formatMinutes(netMinutes(s))}</td>
                  <td className="py-2 pr-4">
                    {!s.clockOutAt || s.breaks.some((b) => !b.endAt) ? (
                      <Badge color="amber">Incomplete</Badge>
                    ) : (
                      <Badge color="green">Complete</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {sessions && sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No attendance records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
