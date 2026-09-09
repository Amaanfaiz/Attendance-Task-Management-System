'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

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
  taskTimeEntries: TaskTimeEntryRow[];
}

interface CorrectionRow {
  id: string;
  targetType: string;
  targetId: string;
  proposedStart: string | null;
  proposedEnd: string | null;
  reason: string;
  status: string;
  decisionComment: string | null;
}

const statusColor: Record<string, 'slate' | 'green' | 'red'> = {
  PENDING: 'slate',
  APPROVED: 'green',
  REJECTED: 'red',
};

function CorrectionForm({
  title,
  targetType,
  options,
}: {
  title: string;
  targetType: 'ATTENDANCE_SESSION' | 'TASK_TIME_ENTRY';
  options: { id: string; label: string }[];
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [proposedStart, setProposedStart] = useState('');
  const [proposedEnd, setProposedEnd] = useState('');
  const [reason, setReason] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.post('/corrections', {
        targetType,
        targetId,
        proposedStart: proposedStart ? new Date(proposedStart).toISOString() : undefined,
        proposedEnd: proposedEnd ? new Date(proposedEnd).toISOString() : undefined,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corrections'] });
      setReason('');
      setProposedStart('');
      setProposedEnd('');
      setTargetId('');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not submit request'),
  });

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {error && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="space-y-3">
        <Field label="Record">
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">Select a record…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={targetType === 'ATTENDANCE_SESSION' ? 'Proposed clock-in' : 'Proposed start'}>
            <Input type="datetime-local" value={proposedStart} onChange={(e) => setProposedStart(e.target.value)} />
          </Field>
          <Field label={targetType === 'ATTENDANCE_SESSION' ? 'Proposed clock-out' : 'Proposed end'}>
            <Input type="datetime-local" value={proposedEnd} onChange={(e) => setProposedEnd(e.target.value)} />
          </Field>
        </div>
        <Field
          label="Reason"
          error={reason.length > 0 && reason.length < 10 ? `At least 10 characters required (${reason.length}/10)` : undefined}
        >
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this record needs correcting" />
        </Field>
        <Button
          disabled={!targetId || reason.length < 10}
          loading={submit.isPending}
          onClick={() => {
            setError(null);
            submit.mutate();
          }}
        >
          Submit Request
        </Button>
      </div>
    </Card>
  );
}

export default function MyCorrectionsPage() {
  const { data: sessions } = useQuery({
    queryKey: ['attendance', 'me', 'history'],
    queryFn: () => api.get<SessionRow[]>('/attendance/me'),
  });
  const { data: corrections } = useQuery({
    queryKey: ['corrections', 'mine'],
    queryFn: () => api.get<CorrectionRow[]>('/corrections/mine'),
  });

  const sessionOptions = (sessions ?? []).map((s) => ({
    id: s.id,
    label: `${new Date(s.clockInAt).toLocaleString()} → ${s.clockOutAt ? new Date(s.clockOutAt).toLocaleString() : 'ongoing'}`,
  }));

  // AC-009-003-01: US-009-003 (request a task-time correction) had no frontend
  // at all - the form only ever offered attendance sessions, even though the
  // backend already fully supported TASK_TIME_ENTRY corrections.
  const taskTimeOptions = (sessions ?? []).flatMap((s) =>
    s.taskTimeEntries.map((t) => ({
      id: t.id,
      label: `${t.task.title}: ${new Date(t.startAt).toLocaleString()} → ${t.endAt ? new Date(t.endAt).toLocaleString() : 'ongoing'}`,
    })),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Corrections</h1>

      <CorrectionForm title="Request an Attendance Correction" targetType="ATTENDANCE_SESSION" options={sessionOptions} />
      <CorrectionForm title="Request a Task Time Correction" targetType="TASK_TIME_ENTRY" options={taskTimeOptions} />

      <Card>
        <CardTitle>My Requests</CardTitle>
        <ul className="divide-y divide-slate-100">
          {(corrections ?? []).map((c) => (
            <li key={c.id} className="py-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-800">{c.targetType.replace('_', ' ')}</span>
                <Badge color={statusColor[c.status] ?? 'slate'}>{c.status}</Badge>
              </div>
              <p className="text-slate-600">{c.reason}</p>
              {c.decisionComment && <p className="mt-1 text-xs text-slate-500">Admin note: {c.decisionComment}</p>}
            </li>
          ))}
          {corrections && corrections.length === 0 && <li className="py-3 text-slate-500">No requests yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
