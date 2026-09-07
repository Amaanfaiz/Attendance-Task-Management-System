'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface SessionRow {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
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

export default function MyCorrectionsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [proposedStart, setProposedStart] = useState('');
  const [proposedEnd, setProposedEnd] = useState('');
  const [reason, setReason] = useState('');

  const { data: sessions } = useQuery({
    queryKey: ['attendance', 'me', 'history'],
    queryFn: () => api.get<SessionRow[]>('/attendance/me'),
  });
  const { data: corrections } = useQuery({
    queryKey: ['corrections', 'mine'],
    queryFn: () => api.get<CorrectionRow[]>('/corrections/mine'),
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post('/corrections', {
        targetType: 'ATTENDANCE_SESSION',
        targetId: sessionId,
        proposedStart: proposedStart ? new Date(proposedStart).toISOString() : undefined,
        proposedEnd: proposedEnd ? new Date(proposedEnd).toISOString() : undefined,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corrections'] });
      setReason('');
      setProposedStart('');
      setProposedEnd('');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not submit request'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Corrections</h1>

      <Card>
        <CardTitle>Request an Attendance Correction</CardTitle>
        {error && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-3">
          <Field label="Attendance record">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              <option value="">Select a record…</option>
              {(sessions ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.clockInAt).toLocaleString()} → {s.clockOutAt ? new Date(s.clockOutAt).toLocaleString() : 'ongoing'}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Proposed clock-in">
              <Input type="datetime-local" value={proposedStart} onChange={(e) => setProposedStart(e.target.value)} />
            </Field>
            <Field label="Proposed clock-out">
              <Input type="datetime-local" value={proposedEnd} onChange={(e) => setProposedEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this record needs correcting" />
          </Field>
          <Button
            disabled={!sessionId || reason.length < 10}
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
