'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { formatMinutes, useReconciliation, computeTimelineGaps } from '@/lib/use-reconciliation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/input';
import { Drawer } from '@/components/ui/drawer';

interface TaskTimeEntryRow {
  id: string;
  startAt: string;
  endAt: string | null;
  status: string;
  task: { id: string; title: string; status: string };
}

interface CorrectionRow {
  id: string;
  targetType: string;
  targetId: string;
  status: string;
}

function durationMinutes(entry: TaskTimeEntryRow): number {
  const end = entry.endAt ? new Date(entry.endAt).getTime() : Date.now();
  return Math.max(0, (end - new Date(entry.startAt).getTime()) / 60000);
}

const correctionStatusColor: Record<string, 'slate' | 'green' | 'red'> = {
  PENDING: 'slate',
  APPROVED: 'green',
  REJECTED: 'red',
};

// Stitch's "Task Time History — Interval Detail" screen: the interval itself
// plus its day's reconciliation context and timeline, reusing the same
// GET /reconciliation/me a given day's My Day view already uses - no new
// endpoint, just a different day than "today".
function IntervalDetailDrawer({ entry, onClose }: { entry: TaskTimeEntryRow; onClose: () => void }) {
  const date = entry.startAt.slice(0, 10);
  const { data: summary } = useReconciliation(date);
  const { data: corrections } = useQuery({
    queryKey: ['corrections', 'mine'],
    queryFn: () => api.get<CorrectionRow[]>('/corrections/mine'),
  });
  const relatedCorrection = (corrections ?? []).find(
    (c) => c.targetType === 'TASK_TIME_ENTRY' && c.targetId === entry.id,
  );

  return (
    <Drawer open onClose={onClose} title={entry.task.title} subtitle={new Date(entry.startAt).toLocaleDateString()}>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs uppercase text-slate-500">Start</p>
            <p className="text-sm font-semibold text-slate-900">{new Date(entry.startAt).toLocaleTimeString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">End</p>
            <p className="text-sm font-semibold text-slate-900">
              {entry.endAt ? new Date(entry.endAt).toLocaleTimeString() : 'Ongoing'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Duration</p>
            <p className="text-sm font-semibold text-slate-900">{formatMinutes(durationMinutes(entry))}</p>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase text-slate-500">Task status</p>
          {entry.status === 'RUNNING' ? <Badge color="green">Running</Badge> : <Badge color="slate">Closed</Badge>}
        </div>

        {summary && (
          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">That day&rsquo;s reconciliation</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs uppercase text-slate-500">Net work</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">{formatMinutes(summary.netWorkingMinutes)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Total task time</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">{formatMinutes(summary.taskMinutes)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Unallocated</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">{formatMinutes(summary.unallocatedMinutes)}</p>
              </div>
            </div>
          </div>
        )}

        {summary && (
          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Day timeline</p>
            <ul className="space-y-2">
              {[...summary.timeline, ...computeTimelineGaps(summary.timeline)]
                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                .map((event, idx) => {
                  const isSelected = event.type === 'TASK' && event.start === entry.startAt;
                  return (
                    <li
                      key={idx}
                      className={
                        'flex items-center gap-3 rounded-md px-2 py-1 text-sm ' + (isSelected ? 'bg-brand-50 ring-1 ring-brand-200' : '')
                      }
                    >
                      <span
                        className={
                          'h-2 w-2 shrink-0 rounded-full ' +
                          (event.type === 'ATTENDANCE'
                            ? 'bg-green-500'
                            : event.type === 'BREAK'
                              ? 'bg-amber-500'
                              : event.type === 'UNALLOCATED'
                                ? 'border border-dashed border-slate-400 bg-transparent'
                                : 'bg-blue-500')
                        }
                      />
                      <span className="w-16 shrink-0 text-slate-500">
                        {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={isSelected ? 'font-semibold text-brand-700' : 'font-medium text-slate-800'}>{event.label}</span>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          {relatedCorrection ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">Related correction:</span>
              <Badge color={correctionStatusColor[relatedCorrection.status] ?? 'slate'}>{relatedCorrection.status}</Badge>
            </div>
          ) : (
            <Link href="/corrections" className="text-sm text-brand-700 hover:underline">
              Request a correction for this interval
            </Link>
          )}
        </div>
      </div>
    </Drawer>
  );
}

// SCR-009 My Task Time History - named in the SRS but never built. This is
// the across-dates equivalent of My Attendance History (SCR-005), backed by
// the new GET /task-timers/history endpoint.
export default function TaskTimeHistoryPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<TaskTimeEntryRow | null>(null);

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
                <th className="py-2 pr-4 text-right">Duration</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelectedEntry(e)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="py-2 pr-4 text-slate-600">{new Date(e.startAt).toLocaleDateString()}</td>
                  <td className="py-2 pr-4 font-medium text-slate-900">{e.task.title}</td>
                  <td className="py-2 pr-4 text-slate-600">{new Date(e.startAt).toLocaleTimeString()}</td>
                  <td className="py-2 pr-4 text-slate-600">{e.endAt ? new Date(e.endAt).toLocaleTimeString() : '—'}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-900">{formatMinutes(durationMinutes(e))}</td>
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
      {selectedEntry && <IntervalDetailDrawer entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}
    </div>
  );
}
