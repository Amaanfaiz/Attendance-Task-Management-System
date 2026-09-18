'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { AuditAction } from '@atms/shared';
import { api } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';

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
  metadataJson: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    const asDate = new Date(value);
    return !Number.isNaN(asDate.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(value)
      ? asDate.toLocaleString()
      : value;
  }
  return JSON.stringify(value);
}

// GET /audit has no export endpoint (only this one @Get() exists server-side)
// so this drawer has no Export control - adding one would imply a capability
// that isn't there. before/after are rendered as a field-by-field diff instead
// of the raw JSON blob the table row used to show, since that's the same data,
// just made legible.
function AuditDetailDrawer({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  const before = isPlainObject(row.beforeJson) ? row.beforeJson : null;
  const after = isPlainObject(row.afterJson) ? row.afterJson : null;
  const metadata = isPlainObject(row.metadataJson) ? row.metadataJson : null;
  const diffKeys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));

  return (
    <Drawer
      open
      onClose={onClose}
      title={row.action.replace(/_/g, ' ')}
      subtitle={new Date(row.createdAt).toLocaleString()}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Actor</p>
            <p className="text-slate-900">{row.actor ? `${row.actor.firstName} ${row.actor.surname}` : 'System'}</p>
            {row.actor && <p className="text-xs text-slate-500">{row.actor.email}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Target</p>
            <p className="text-slate-900">{row.targetType.replace(/_/g, ' ')}</p>
            {row.targetId && <p className="truncate font-mono text-xs text-slate-500">{row.targetId}</p>}
          </div>
        </div>

        {diffKeys.length > 0 ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Before / After</p>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pl-3 pr-2">Field</th>
                    <th className="py-2 px-2">Before</th>
                    <th className="py-2 px-2">After</th>
                  </tr>
                </thead>
                <tbody>
                  {diffKeys.map((key) => {
                    const beforeVal = before?.[key];
                    const afterVal = after?.[key];
                    const changed = JSON.stringify(beforeVal) !== JSON.stringify(afterVal);
                    return (
                      <tr key={key} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pl-3 pr-2 font-medium text-slate-700">{key}</td>
                        <td className="py-2 px-2 text-slate-500">{formatValue(beforeVal)}</td>
                        <td className={'py-2 px-2 ' + (changed ? 'font-medium text-amber-700' : 'text-slate-500')}>
                          {formatValue(afterVal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No before/after values were recorded for this action.</p>
        )}

        {metadata && Object.keys(metadata).length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Additional detail</p>
            <dl className="space-y-1.5 text-sm">
              {Object.entries(metadata).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="shrink-0 font-medium text-slate-700">{key}:</dt>
                  <dd className="text-slate-600">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Drawer>
  );
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = (data ?? []).find((r) => r.id === selectedId) ?? null;

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
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className="cursor-pointer border-b border-slate-100 align-top hover:bg-slate-50"
                >
                  <td className="py-2.5 pr-4 whitespace-nowrap text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap font-medium text-slate-900">
                    {row.actor ? `${row.actor.firstName} ${row.actor.surname}` : 'System'}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <Badge color={actionColor(row.action)}>{row.action.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-slate-600">{row.targetType.replace(/_/g, ' ')}</td>
                  <td className="py-2.5 pr-4">
                    <ChevronRight size={16} className="text-slate-400" aria-hidden="true" />
                  </td>
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    No audit events match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <AuditDetailDrawer row={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
