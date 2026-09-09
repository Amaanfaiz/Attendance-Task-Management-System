'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserStatus } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

interface CorrectionRow {
  id: string;
  targetType: string;
  targetId: string;
  proposedStart: string | null;
  proposedEnd: string | null;
  currentStart: string | null;
  currentEnd: string | null;
  reason: string;
  requestedBy: { firstName: string; surname: string };
  createdAt: string;
}

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
interface TaskTimeEntryRow {
  id: string;
  startAt: string;
  endAt: string | null;
  task: { title: string };
}
interface SessionRow {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  breaks: BreakRow[];
  taskTimeEntries: TaskTimeEntryRow[];
}

type TargetType = 'ATTENDANCE_SESSION' | 'BREAK_RECORD' | 'TASK_TIME_ENTRY';

// US-009-004: "As an administrator, I want to correct authorised records
// directly" had a fully-built, audited backend (POST /corrections/direct)
// but zero UI anywhere - an admin had no way to even discover another user's
// record ids to correct, let alone submit one. Built end-to-end: pick an
// employee, pick one of their real records (any type), propose new
// start/end, apply immediately.
function DirectCorrectionForm() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [target, setTarget] = useState('');
  const [proposedStart, setProposedStart] = useState('');
  const [proposedEnd, setProposedEnd] = useState('');
  const [reason, setReason] = useState('');

  const { data: users } = useQuery({
    queryKey: ['users', 'admin', 'active-for-direct-correction'],
    queryFn: () => api.get<UserOption[]>('/users', { status: UserStatus.ACTIVE }),
  });

  const { data: sessions } = useQuery({
    queryKey: ['attendance', 'admin', 'history', employeeId],
    queryFn: () => api.get<SessionRow[]>('/attendance/admin/history', { userId: employeeId }),
    enabled: Boolean(employeeId),
  });

  const options: { value: string; targetType: TargetType; targetId: string; label: string }[] = (sessions ?? []).flatMap(
    (s) => [
      {
        value: `ATTENDANCE_SESSION:${s.id}`,
        targetType: 'ATTENDANCE_SESSION' as const,
        targetId: s.id,
        label: `Attendance: ${new Date(s.clockInAt).toLocaleString()} → ${s.clockOutAt ? new Date(s.clockOutAt).toLocaleString() : 'ongoing'}`,
      },
      ...s.breaks.map((b) => ({
        value: `BREAK_RECORD:${b.id}`,
        targetType: 'BREAK_RECORD' as const,
        targetId: b.id,
        label: `Break: ${new Date(b.startAt).toLocaleString()} → ${b.endAt ? new Date(b.endAt).toLocaleString() : 'ongoing'}`,
      })),
      ...s.taskTimeEntries.map((t) => ({
        value: `TASK_TIME_ENTRY:${t.id}`,
        targetType: 'TASK_TIME_ENTRY' as const,
        targetId: t.id,
        label: `Task (${t.task.title}): ${new Date(t.startAt).toLocaleString()} → ${t.endAt ? new Date(t.endAt).toLocaleString() : 'ongoing'}`,
      })),
    ],
  );

  const selected = options.find((o) => o.value === target);

  const submit = useMutation({
    mutationFn: () =>
      api.post('/corrections/direct', {
        targetType: selected!.targetType,
        targetId: selected!.targetId,
        proposedStart: proposedStart ? new Date(proposedStart).toISOString() : undefined,
        proposedEnd: proposedEnd ? new Date(proposedEnd).toISOString() : undefined,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setSuccess(true);
      setTarget('');
      setProposedStart('');
      setProposedEnd('');
      setReason('');
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not apply correction'),
  });

  return (
    <Card>
      <CardTitle>Apply a Direct Correction</CardTitle>
      <p className="mb-3 text-xs text-slate-500">
        Applies immediately (no approval step) - use for operational errors that need resolving right away.
      </p>
      {error && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {success && <p className="mb-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">Correction applied.</p>}
      <div className="space-y-3">
        <Field label="Employee">
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              setTarget('');
            }}
          >
            <option value="">Select an employee…</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.surname}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Record">
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={!employeeId}
          >
            <option value="">Select a record…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Proposed start">
            <Input type="datetime-local" value={proposedStart} onChange={(e) => setProposedStart(e.target.value)} />
          </Field>
          <Field label="Proposed end">
            <Input type="datetime-local" value={proposedEnd} onChange={(e) => setProposedEnd(e.target.value)} />
          </Field>
        </div>
        <Field
          label="Reason"
          error={reason.length > 0 && reason.length < 10 ? `At least 10 characters required (${reason.length}/10)` : undefined}
        >
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this record needs correcting" />
        </Field>
        <Button disabled={!selected || reason.length < 10} loading={submit.isPending} onClick={() => { setError(null); submit.mutate(); }}>
          Apply Correction
        </Button>
      </div>
    </Card>
  );
}

export default function AdminCorrectionsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const { data: pending, isLoading } = useQuery({
    queryKey: ['corrections', 'pending'],
    queryFn: () => api.get<CorrectionRow[]>('/corrections/pending'),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post(`/corrections/${id}/decide`, { approve, comment: comment[id] || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['corrections', 'pending'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not decide'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Correction Review</h1>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Card>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <ul className="divide-y divide-slate-100">
          {(pending ?? []).map((c) => (
            <li key={c.id} className="py-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-900">
                  {c.requestedBy.firstName} {c.requestedBy.surname} · {c.targetType.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="mb-2 text-sm text-slate-600">{c.reason}</p>
              {/* AC-009-002-01: current value shown next to the proposal, not just the proposal alone. */}
              <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-slate-500">
                <span>
                  Current start: {c.currentStart ? new Date(c.currentStart).toLocaleString() : '—'}
                </span>
                <span>
                  Proposed start:{' '}
                  {c.proposedStart ? (
                    <span className="font-medium text-slate-900">{new Date(c.proposedStart).toLocaleString()}</span>
                  ) : (
                    '(unchanged)'
                  )}
                </span>
                <span>Current end: {c.currentEnd ? new Date(c.currentEnd).toLocaleString() : '—'}</span>
                <span>
                  Proposed end:{' '}
                  {c.proposedEnd ? (
                    <span className="font-medium text-slate-900">{new Date(c.proposedEnd).toLocaleString()}</span>
                  ) : (
                    '(unchanged)'
                  )}
                </span>
              </div>
              {/* AC-009-002-03: rejection (and approval) can carry an optional comment -
                  the backend already accepted one, but this screen never had a field for it. */}
              <Field label="Decision comment (optional)">
                <Input
                  value={comment[c.id] ?? ''}
                  onChange={(e) => setComment((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  placeholder="Note for the requester"
                />
              </Field>
              <div className="mt-2 flex gap-2">
                <Button onClick={() => decide.mutate({ id: c.id, approve: true })} loading={decide.isPending}>
                  Approve
                </Button>
                <Button variant="danger" onClick={() => decide.mutate({ id: c.id, approve: false })}>
                  Reject
                </Button>
              </div>
            </li>
          ))}
          {pending && pending.length === 0 && <li className="py-4 text-sm text-slate-500">No pending corrections.</li>}
        </ul>
      </Card>

      <DirectCorrectionForm />
    </div>
  );
}
