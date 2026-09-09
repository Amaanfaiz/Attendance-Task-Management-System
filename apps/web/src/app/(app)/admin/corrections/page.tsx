'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

export default function AdminCorrectionsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data: pending, isLoading } = useQuery({
    queryKey: ['corrections', 'pending'],
    queryFn: () => api.get<CorrectionRow[]>('/corrections/pending'),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post(`/corrections/${id}/decide`, { approve }),
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
              <div className="flex gap-2">
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
    </div>
  );
}
