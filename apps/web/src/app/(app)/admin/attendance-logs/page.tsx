'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { UserStatus } from '@atms/shared';
import { api } from '@/lib/api-client';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/input';

interface UserOption {
  id: string;
  firstName: string;
  surname: string;
}

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

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

// SCR-017 Attendance Logs - named in the SRS but never built, distinct from
// Live Attendance (today's status only) and from the Reports > Daily
// Attendance export (aggregate/CSV, not a record-level drill-down). Backs
// onto GET /attendance/admin/history, which already existed for the
// Corrections page's user lookup but had no standalone browsing screen; each
// row reuses the existing session detail page, which already supports admin
// access to any user's session.
export default function AttendanceLogsPage() {
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());

  const { data: users } = useQuery({
    queryKey: ['users', 'admin', 'active-for-logs'],
    queryFn: () => api.get<UserOption[]>('/users', { status: UserStatus.ACTIVE }),
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['attendance', 'admin', 'history', userId, from, to],
    queryFn: () => api.get<SessionRow[]>('/attendance/admin/history', { userId, from, to }),
    enabled: Boolean(userId),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Attendance Logs</h1>
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:max-w-xl">
          <Field label="Employee">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Select an employee…</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.surname}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        {!userId && <p className="text-sm text-slate-500">Select an employee to view their attendance log.</p>}
        {userId && isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {userId && (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Attendance logs table">
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
                    <td className="py-2 pr-4">
                      <Link href={`/attendance/${s.id}`} className="text-slate-900 hover:underline">
                        {new Date(s.clockInAt).toLocaleDateString()}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{new Date(s.clockInAt).toLocaleTimeString()}</td>
                    <td className="py-2 pr-4">{s.clockOutAt ? new Date(s.clockOutAt).toLocaleTimeString() : '—'}</td>
                    <td className="py-2 pr-4">{formatMinutes(breakMinutes(s))}</td>
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
                      No attendance records in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
