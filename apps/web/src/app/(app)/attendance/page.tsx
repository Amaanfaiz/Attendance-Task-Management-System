'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/input';
import { SessionDetailDrawer } from '@/components/attendance/session-detail-drawer';

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

function breakMinutes(session: SessionRow): number {
  return session.breaks.reduce((sum, b) => {
    const bEnd = b.endAt ? new Date(b.endAt).getTime() : Date.now();
    return sum + (bEnd - new Date(b.startAt).getTime()) / 60000;
  }, 0);
}

function netMinutes(session: SessionRow): number {
  const end = session.clockOutAt ? new Date(session.clockOutAt).getTime() : Date.now();
  const gross = (end - new Date(session.clockInAt).getTime()) / 60000;
  return Math.max(0, gross - breakMinutes(session));
}

export default function AttendanceHistoryPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['attendance', 'me', 'history', from, to],
    queryFn: () =>
      api.get<SessionRow[]>('/attendance/me', {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Attendance History</h1>
      <Card>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Attendance history table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Clock In</th>
                <th className="py-2 pr-4">Clock Out</th>
                <th className="py-2 pr-4 text-right">Breaks</th>
                <th className="py-2 pr-4 text-right">Net Work</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {(sessions ?? []).map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedSessionId(s.id);
                    }
                  }}
                  tabIndex={0}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset"
                >
                  <td className="py-2 pr-4 font-medium text-slate-900">{new Date(s.clockInAt).toLocaleDateString()}</td>
                  <td className="py-2 pr-4 text-slate-600">{new Date(s.clockInAt).toLocaleTimeString()}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.clockOutAt ? new Date(s.clockOutAt).toLocaleTimeString() : '—'}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-900">{formatMinutes(breakMinutes(s))}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-900">{formatMinutes(netMinutes(s))}</td>
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
      {selectedSessionId && (
        <SessionDetailDrawer sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} canRequestCorrection />
      )}
    </div>
  );
}
