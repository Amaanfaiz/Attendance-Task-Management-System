'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/input';

interface TaskTimeEntryRow {
  id: string;
  startAt: string;
  endAt: string | null;
  status: string;
  task: { id: string; title: string; status: string };
}

function durationMinutes(entry: TaskTimeEntryRow): number {
  const end = entry.endAt ? new Date(entry.endAt).getTime() : Date.now();
  return Math.max(0, (end - new Date(entry.startAt).getTime()) / 60000);
}

// SCR-009 My Task Time History - named in the SRS but never built. The
// existing "daily-log" endpoint only ever covered today (used by My Day);
// this is the across-dates equivalent of My Attendance History (SCR-005),
// backed by the new GET /task-timers/history endpoint.
export default function TaskTimeHistoryPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: entries, isLoading } = useQuery({
    queryKey: ['task-timers', 'history', from, to],
    queryFn: () =>
      api.get<TaskTimeEntryRow[]>('/task-timers/history', {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Task Time History</h1>
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
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Task time history table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Task</th>
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">Duration</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{new Date(e.startAt).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/tasks/${e.task.id}`} className="text-slate-900 hover:underline">
                      {e.task.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{new Date(e.startAt).toLocaleTimeString()}</td>
                  <td className="py-2 pr-4">{e.endAt ? new Date(e.endAt).toLocaleTimeString() : '—'}</td>
                  <td className="py-2 pr-4">{formatMinutes(durationMinutes(e))}</td>
                  <td className="py-2 pr-4">
                    {e.status === 'RUNNING' ? <Badge color="green">Running</Badge> : <Badge color="slate">Closed</Badge>}
                  </td>
                </tr>
              ))}
              {entries && entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No task time recorded yet.
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
