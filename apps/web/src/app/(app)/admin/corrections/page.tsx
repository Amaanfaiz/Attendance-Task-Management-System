'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, ChevronRight } from 'lucide-react';
import { UserStatus } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { formatMinutes } from '@/lib/use-reconciliation';

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

function durationMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

// AC-009-002-01..04: Original -> Requested -> Impact -> Reason -> Decision.
// "Impact" is the duration delta this proposal would produce, computed
// client-side from fields the pending-list response already carries (no new
// backend capability) - falling back to the record's own unchanged boundary
// when only one of start/end is proposed, matching decide()'s own
// effectiveStart/effectiveEnd logic server-side.
function ReviewDrawer({
  correction,
  comment,
  onCommentChange,
  onDecide,
  deciding,
  onClose,
}: {
  correction: CorrectionRow;
  comment: string;
  onCommentChange: (value: string) => void;
  onDecide: (approve: boolean) => void;
  deciding: boolean;
  onClose: () => void;
}) {
  const effectiveStart = correction.proposedStart ?? correction.currentStart;
  const effectiveEnd = correction.proposedEnd ?? correction.currentEnd;
  const currentDuration = durationMinutes(correction.currentStart, correction.currentEnd);
  const requestedDuration = durationMinutes(effectiveStart, effectiveEnd);
  const delta = currentDuration !== null && requestedDuration !== null ? requestedDuration - currentDuration : null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${correction.requestedBy.firstName} ${correction.requestedBy.surname}`}
      subtitle={new Date(correction.createdAt).toLocaleString()}
    >
      <div className="space-y-6">
        <Badge color="slate">{correction.targetType.replace('_', ' ')}</Badge>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Original</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Start</p>
              <p className="text-slate-900">{correction.currentStart ? new Date(correction.currentStart).toLocaleString() : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">End</p>
              <p className="text-slate-900">{correction.currentEnd ? new Date(correction.currentEnd).toLocaleString() : '— (ongoing)'}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Requested</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Start</p>
              <p className="font-medium text-slate-900">
                {correction.proposedStart ? new Date(correction.proposedStart).toLocaleString() : '(unchanged)'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">End</p>
              <p className="font-medium text-slate-900">
                {correction.proposedEnd ? new Date(correction.proposedEnd).toLocaleString() : '(unchanged)'}
              </p>
            </div>
          </div>
        </div>

        {delta !== null && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Impact</p>
            <p className={'text-sm font-medium ' + (delta === 0 ? 'text-slate-600' : delta > 0 ? 'text-green-700' : 'text-red-700')}>
              {delta === 0 ? 'No change to duration' : `${delta > 0 ? '+' : ''}${formatMinutes(delta)} vs original duration`}
            </p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Reason</p>
          <p className="text-sm text-slate-700">{correction.reason}</p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Decision</p>
          <Field label="Comment (optional)">
            <Input
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Note for the requester"
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button icon={<Check size={16} aria-hidden="true" />} onClick={() => onDecide(true)} loading={deciding}>
              Approve
            </Button>
            <Button icon={<X size={16} aria-hidden="true" />} variant="danger" onClick={() => onDecide(false)}>
              Reject
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

// US-009-004: "As an administrator, I want to correct authorised records
// directly" had a fully-built, audited backend (POST /corrections/direct)
// but zero UI anywhere - an admin had no way to even discover another user's
// record ids to correct, let alone submit one. Built end-to-end: pick an
// employee, pick one of their real records (any type), propose new
// start/end, apply immediately. Kept as its own card, visually separate from
// the approve/reject queue above, since it's a different capability
// (immediate, no approval step) rather than another queue item.
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
          <Select
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
          </Select>
        </Field>
        <Field label="Record">
          <Select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!employeeId}>
            <option value="">Select a record…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
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
        <Button
          icon={<Check size={16} aria-hidden="true" />}
          disabled={!selected || reason.length < 10}
          loading={submit.isPending}
          onClick={() => { setError(null); submit.mutate(); }}
        >
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: pending, isLoading } = useQuery({
    queryKey: ['corrections', 'pending'],
    queryFn: () => api.get<CorrectionRow[]>('/corrections/pending'),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post(`/corrections/${id}/decide`, { approve, comment: comment[id] || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corrections', 'pending'] });
      setSelectedId(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not decide'),
  });

  const selected = (pending ?? []).find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Correction Review</h1>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Card>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <ul className="divide-y divide-slate-100">
          {(pending ?? []).map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                className="flex w-full items-center justify-between gap-3 py-4 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {c.requestedBy.firstName} {c.requestedBy.surname}
                    </span>
                    <Badge color="slate">{c.targetType.replace('_', ' ')}</Badge>
                  </div>
                  <p className="truncate text-sm text-slate-500">{c.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  {new Date(c.createdAt).toLocaleDateString()}
                  <ChevronRight size={16} className="text-slate-400" aria-hidden="true" />
                </div>
              </button>
            </li>
          ))}
          {pending && pending.length === 0 && <li className="py-4 text-sm text-slate-500">No pending corrections.</li>}
        </ul>
      </Card>

      <DirectCorrectionForm />

      {selected && (
        <ReviewDrawer
          correction={selected}
          comment={comment[selected.id] ?? ''}
          onCommentChange={(value) => setComment((prev) => ({ ...prev, [selected.id]: value }))}
          onDecide={(approve) => { setError(null); decide.mutate({ id: selected.id, approve }); }}
          deciding={decide.isPending}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
