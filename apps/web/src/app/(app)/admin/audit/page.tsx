'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuditAction } from '@atms/shared';
import { api } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface UserOption {
  id: string;
  firstName: string;
  surname: string;
}

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
  actor: { firstName: string; surname: string; email: string } | null;
  beforeJson: unknown;
  afterJson: unknown;
}

// Groups the 15 AuditAction values by what they mean for the reader, not by
// enum order - a rejection/removal should read as red regardless of which
// entity it's on, same for something newly created/approved reading green.
function actionColor(action: string): 'green' | 'red' | 'amber' | 'blue' | 'slate' {
  if (action.endsWith('_REJECTED')) return 'red';
  if (action.endsWith('_APPROVED') || action.endsWith('_CREATED')) return 'green';
  if (action === 'ADMIN_DIRECT_CORRECTION') return 'amber';
  if (action.endsWith('_CHANGED') || action.endsWith('_UPDATED') || action.endsWith('_ASSIGNED')) return 'blue';
  return 'slate';
}

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // GET /audit already accepted actorId/from/to (server caps the log at 500 rows
  // with no way to narrow it), and no control here ever set them - found via
  // API-vs-UI audit. No status filter: an actor on a historical entry may no
  // longer be active, and should still be pickable.
  const { data: actors } = useQuery({
    queryKey: ['users', 'admin', 'all-for-audit'],
    queryFn: () => api.get<UserOption[]>('/users'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit', action, actorId, from, to],
    queryFn: () =>
      api.get<AuditRow[]>('/audit', {
        action: action || undefined,
        actorId: actorId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Audit Log</h1>
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Filter by action">
            <Select uiSize="sm" className="w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All</option>
              {Object.values(AuditAction).map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Actor">
            <Select uiSize="sm" className="w-auto" value={actorId} onChange={(e) => setActorId(e.target.value)}>
              <option value="">All</option>
              {(actors ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.surname}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Audit log table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Details</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                  <td className="py-2.5 pr-4 whitespace-nowrap text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap font-medium text-slate-900">
                    {row.actor ? `${row.actor.firstName} ${row.actor.surname}` : 'System'}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <Badge color={actionColor(row.action)}>{row.action.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-slate-600">{row.targetType}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">
                    {row.beforeJson ? `before: ${JSON.stringify(row.beforeJson)} ` : ''}
                    {row.afterJson ? `after: ${JSON.stringify(row.afterJson)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
