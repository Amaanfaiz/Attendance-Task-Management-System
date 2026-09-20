'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { DocumentType } from '@atms/shared';
import { api, ApiError, exportUrl } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

interface DocumentRow {
  id: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; surname: string };
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.PASSPORT]: 'Passport',
  [DocumentType.RIGHT_TO_WORK_SHARE_CODE]: 'Right to Work Share Code',
  [DocumentType.EVISA]: 'eVisa',
  [DocumentType.ADDRESS_PROOF]: 'Address Proof',
  [DocumentType.BANK_DETAILS]: 'Bank Details',
  [DocumentType.NI_NUMBER]: 'NI Number',
  [DocumentType.CV]: 'CV',
  [DocumentType.EDUCATION_CERTIFICATE]: 'Education Certificate',
  [DocumentType.DRIVING_LICENCE]: 'Driving Licence',
  [DocumentType.MISCELLANEOUS]: 'Miscellaneous',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// EP-013: shared between the admin User Detail Drawer and the self-service
// Profile page - both hit the exact same self-or-admin backend routes
// (`/users/:id/documents*`), the only difference being whether Delete is
// shown (admin-only, even over an employee's own documents - see
// documents.service.ts for why). Uploads apply immediately either way;
// Documents were deliberately left outside the Personal
// Details/Emergency Contact approval workflow.
export function DocumentsSection({ userId, canDelete }: { userId: string; canDelete: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocumentType>(DocumentType.PASSPORT);
  const [file, setFile] = useState<File | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['users', userId, 'documents'],
    queryFn: () => api.get<DocumentRow[]>(`/users/${userId}/documents`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users', userId, 'documents'] });

  const upload = useMutation({
    mutationFn: () => api.upload(`/users/${userId}/documents`, file!, { type: docType }),
    onSuccess: () => {
      invalidate();
      setFile(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not upload this file'),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) => api.delete(`/users/${userId}/documents/${documentId}`),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not delete this document'),
  });

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {(documents ?? []).map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{doc.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {DOCUMENT_TYPE_LABELS[doc.type]} · {formatFileSize(doc.fileSizeBytes)} · uploaded by{' '}
                    {doc.uploadedBy.firstName} {doc.uploadedBy.surname} on {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={exportUrl(`/users/${userId}/documents/${doc.id}/download`, {})}
                  className="inline-flex items-center gap-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Download ${doc.fileName}`}
                >
                  <Download size={16} aria-hidden="true" />
                </a>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(doc.id)}
                    disabled={remove.isPending}
                    className="inline-flex items-center gap-1 rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${doc.fileName}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {documents && documents.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-slate-500">No documents uploaded yet.</li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <Select
            aria-label="Document type"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
          >
            {Object.values(DocumentType).map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          aria-label="Document file"
          onChange={(e) => {
            setError(null);
            setFile(e.target.files?.[0] ?? null);
          }}
          className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <Button
          icon={<Upload size={16} aria-hidden="true" />}
          disabled={!file}
          loading={upload.isPending}
          onClick={() => {
            setError(null);
            upload.mutate();
          }}
        >
          Upload
        </Button>
      </div>
    </div>
  );
}
