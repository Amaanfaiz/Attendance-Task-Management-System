'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, ChevronRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';

interface ProfileChangeRow {
  id: string;
  targetType: 'EMPLOYEE_PROFILE' | 'EMERGENCY_CONTACT';
  proposedData: Record<string, unknown>;
  current: Record<string, unknown> | null;
  reason: string;
  user: { firstName: string; surname: string };
  createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  address: 'Address',
  mobilePhone: 'Mobile phone',
  personalEmail: 'Personal email',
  bankAccountName: 'Bank account name',
  bankSortCode: 'Bank sort code',
  bankAccountNumber: 'Bank account number',
  fullName: 'Full name',
  relationship: 'Relationship',
  mobile: 'Mobile',
  landline: 'Landline',
  email: 'Email',
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '— (not set)';
  return String(value);
}

// EP-013: mirrors admin/corrections/page.tsx's ReviewDrawer shape - current vs
// proposed, a reason, an optional decision comment, Approve/Reject. The field
// set differs by targetType (Personal Details vs Emergency Contact), so this
// walks the union of keys present in either side instead of hardcoding one
// shape - both request types render through the same drawer.
function ReviewDrawer({
  request,
  comment,
  onCommentChange,
  onDecide,
  deciding,
  onClose,
}: {
  request: ProfileChangeRow;
  comment: string;
  onCommentChange: (value: string) => void;
  onDecide: (approve: boolean) => void;
  deciding: boolean;
  onClose: () => void;
}) {
  const keys = Array.from(
    new Set([
      ...Object.keys(request.current ?? {}),
      ...Object.keys(request.proposedData ?? {}),
    ]),
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${request.user.firstName} ${request.user.surname}`}
      subtitle={new Date(request.createdAt).toLocaleString()}
    >
      <div className="space-y-6">
        <Badge color="slate">{request.targetType.replace('_', ' ')}</Badge>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Changes</p>
          <div className="space-y-2">
            {keys.map((key) => {
              const before = displayValue(request.current?.[key]);
              const after = displayValue(request.proposedData?.[key]);
              const changed = before !== after;
              return (
                <div key={key} className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">{FIELD_LABELS[key] ?? key}</p>
                    <p className="text-slate-500">{before}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">&nbsp;</p>
                    <p className={changed ? 'font-medium text-slate-900' : 'text-slate-500'}>{after}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Reason</p>
          <p className="text-sm text-slate-700">{request.reason}</p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Decision</p>
          <Field label="Comment (optional)">
            <Input value={comment} onChange={(e) => onCommentChange(e.target.value)} placeholder="Note for the requester" />
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

export default function AdminProfileChangesPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: pending, isLoading } = useQuery({
    queryKey: ['profile-changes', 'pending'],
    queryFn: () => api.get<ProfileChangeRow[]>('/profile-changes/pending'),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post(`/profile-changes/${id}/decide`, { approve, comment: comment[id] || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-changes', 'pending'] });
      setSelectedId(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not decide'),
  });

  const selected = (pending ?? []).find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Profile Change Review</h1>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Card>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <ul className="divide-y divide-slate-100">
          {(pending ?? []).map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelectedId(r.id)}
                className="flex w-full items-center justify-between gap-3 py-4 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {r.user.firstName} {r.user.surname}
                    </span>
                    <Badge color="slate">{r.targetType.replace('_', ' ')}</Badge>
                  </div>
                  <p className="truncate text-sm text-slate-500">{r.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  {new Date(r.createdAt).toLocaleDateString()}
                  <ChevronRight size={16} className="text-slate-400" aria-hidden="true" />
                </div>
              </button>
            </li>
          ))}
          {pending && pending.length === 0 && (
            <li className="py-4 text-sm text-slate-500">No pending profile changes.</li>
          )}
        </ul>
      </Card>

      {selected && (
        <ReviewDrawer
          request={selected}
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
