'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, ChevronRight, FileText } from 'lucide-react';
import { DocumentType } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { DOCUMENT_TYPE_LABELS } from '@/components/documents-section';

interface DeletionRequestRow {
  id: string;
  reason: string;
  createdAt: string;
  document: { id: string; fileName: string; type: DocumentType; userId: string };
  requestedBy: { id: string; firstName: string; surname: string; email: string };
}

// No current-vs-proposed diff needed here, unlike Profile Changes - this is
// just "delete this file, yes/no", so the drawer shows the document's
// identity and the employee's stated reason instead of a field-by-field
// comparison.
function ReviewDrawer({
  request,
  comment,
  onCommentChange,
  onDecide,
  deciding,
  onClose,
}: {
  request: DeletionRequestRow;
  comment: string;
  onCommentChange: (value: string) => void;
  onDecide: (approve: boolean) => void;
  deciding: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${request.requestedBy.firstName} ${request.requestedBy.surname}`}
      subtitle={new Date(request.createdAt).toLocaleString()}
    >
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Document</p>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 p-3">
            <FileText size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{request.document.fileName}</p>
              <Badge color="slate">{DOCUMENT_TYPE_LABELS[request.document.type]}</Badge>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Reason</p>
          <p className="text-sm text-slate-700">{request.reason}</p>
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

export default function AdminDocumentDeletionsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: pending, isLoading } = useQuery({
    queryKey: ['document-deletion-requests', 'pending'],
    queryFn: () => api.get<DeletionRequestRow[]>('/document-deletion-requests/pending'),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post(`/document-deletion-requests/${id}/decide`, { approve, comment: comment[id] || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-deletion-requests', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSelectedId(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not decide'),
  });

  const selected = (pending ?? []).find((r) => r.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Document Deletions</h1>
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
                      {r.requestedBy.firstName} {r.requestedBy.surname}
                    </span>
                    <Badge color="slate">{DOCUMENT_TYPE_LABELS[r.document.type]}</Badge>
                  </div>
                  <p className="truncate text-sm text-slate-500">
                    {r.document.fileName} — {r.reason}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  {new Date(r.createdAt).toLocaleDateString()}
                  <ChevronRight size={16} className="text-slate-400" aria-hidden="true" />
                </div>
              </button>
            </li>
          ))}
          {pending && pending.length === 0 && (
            <li className="py-4 text-sm text-slate-500">No pending document deletion requests.</li>
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
