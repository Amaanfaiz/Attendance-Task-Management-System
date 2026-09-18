'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';

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

function findOriginal(
  correction: CorrectionRow,
  sessions: SessionRow[],
): { start: string | null; end: string | null } | null {
  if (correction.targetType === 'ATTENDANCE_SESSION') {
    const session = sessions.find((s) => s.id === correction.targetId);
    return session ? { start: session.clockInAt, end: session.clockOutAt } : null;
  }
  for (const session of sessions) {
    const entry = session.taskTimeEntries.find((t) => t.id === correction.targetId);
    if (entry) return { start: entry.startAt, end: entry.endAt };
  }
  return null;
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start) return '—';
  const minutes = Math.round(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

// Original -> Requested -> Impact -> Reason -> Decision: every value here is
// real (looked up from the same /attendance/me sessions the request forms
// already fetch, or the correction record itself) - nothing computed that
// isn't directly derivable from data the page already has.
function CorrectionDetailDrawer({
  correction,
  sessions,
  onClose,
}: {
  correction: CorrectionRow;
  sessions: SessionRow[];
  onClose: () => void;
}) {
  const original = findOriginal(correction, sessions);
  const originalDuration = original ? durationLabel(original.start, original.end) : null;
  const requestedDuration =
    correction.proposedStart || correction.proposedEnd
      ? durationLabel(
          correction.proposedStart ?? original?.start ?? null,
          correction.proposedEnd ?? original?.end ?? null,
        )
      : null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={correction.targetType.replace('_', ' ')}
      subtitle={original ? formatDateTime(original.start) : undefined}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Status</span>
          <Badge color={statusColor[correction.status] ?? 'slate'}>{correction.status}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Original</p>
            <p className="text-sm text-slate-900">{original ? formatDateTime(original.start) : '—'}</p>
            <p className="text-sm text-slate-900">→ {original ? formatDateTime(original.end) : '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Requested</p>
            <p className="text-sm text-slate-900">{correction.proposedStart ? formatDateTime(correction.proposedStart) : 'Unchanged'}</p>
            <p className="text-sm text-slate-900">→ {correction.proposedEnd ? formatDateTime(correction.proposedEnd) : 'Unchanged'}</p>
          </div>
        </div>

        {originalDuration && requestedDuration && (
          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Impact</p>
            <p className="text-sm text-slate-700">
              {originalDuration} <span className="text-slate-400">→</span> {requestedDuration}
            </p>
          </div>
        )}

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Reason</p>
          <p className="text-sm text-slate-700">{correction.reason}</p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Decision</p>
          {correction.status === 'PENDING' ? (
            <p className="text-sm text-slate-500">Awaiting administrator review.</p>
          ) : (
            <p className="text-sm text-slate-700">
              {correction.decisionComment ?? `No comment provided with this ${correction.status.toLowerCase()} decision.`}
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

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
          <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Select a record…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
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
          icon={<Send size={16} aria-hidden="true" />}
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
  const [selectedCorrection, setSelectedCorrection] = useState<CorrectionRow | null>(null);
  const { data: sessions } = useQuery({
    queryKey: ['attendance', 'me', 'history'],
    queryFn: () => api.get<SessionRow[]>('/attendance/me'),
  });
  const { data: corrections } = useQuery({
    queryKey: ['corrections', 'mine'],
    queryFn: () => api.get<CorrectionRow[]>('/corrections/mine'),
  });

  const pendingCount = (corrections ?? []).filter((c) => c.status === 'PENDING').length;
  const approvedCount = (corrections ?? []).filter((c) => c.status === 'APPROVED').length;
  const rejectedCount = (corrections ?? []).filter((c) => c.status === 'REJECTED').length;

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

      {corrections && corrections.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending</p>
            <p className="text-2xl font-semibold text-slate-900">{pendingCount}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">Approved</p>
            <p className="text-2xl font-semibold text-green-600">{approvedCount}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">Rejected</p>
            <p className="text-2xl font-semibold text-red-600">{rejectedCount}</p>
          </Card>
        </div>
      )}

      <CorrectionForm title="Request an Attendance Correction" targetType="ATTENDANCE_SESSION" options={sessionOptions} />
      <CorrectionForm title="Request a Task Time Correction" targetType="TASK_TIME_ENTRY" options={taskTimeOptions} />

      <Card>
        <CardTitle>My Requests</CardTitle>
        <ul className="divide-y divide-slate-100">
          {(corrections ?? []).map((c) => (
            <li key={c.id}>
              <button onClick={() => setSelectedCorrection(c)} className="w-full py-3 text-left text-sm hover:bg-slate-50">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-slate-800">{c.targetType.replace('_', ' ')}</span>
                  <Badge color={statusColor[c.status] ?? 'slate'}>{c.status}</Badge>
                </div>
                <p className="text-slate-600">{c.reason}</p>
                {c.decisionComment && <p className="mt-1 text-xs text-slate-500">Admin note: {c.decisionComment}</p>}
              </button>
            </li>
          ))}
          {corrections && corrections.length === 0 && <li className="py-3 text-slate-500">No requests yet.</li>}
        </ul>
      </Card>
      {selectedCorrection && (
        <CorrectionDetailDrawer
          correction={selectedCorrection}
          sessions={sessions ?? []}
          onClose={() => setSelectedCorrection(null)}
        />
      )}
    </div>
  );
}
