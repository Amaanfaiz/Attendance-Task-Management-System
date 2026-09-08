'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, exportUrl } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

const REPORTS = [
  { value: 'attendance', label: 'Daily Attendance' },
  { value: 'task-time', label: 'Task Time' },
  { value: 'unallocated', label: 'Unallocated Time' },
  { value: 'breaks', label: 'Breaks' },
] as const;

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [report, setReport] = useState<(typeof REPORTS)[number]['value']>('attendance');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reports', report, from, to],
    queryFn: () =>
      api.get<{ rows: Record<string, unknown>[] }>(`/reports/${report}`, { from, to, format: 'json' }),
  });

  const columns = data?.rows?.[0] ? Object.keys(data.rows[0]) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Report">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={report}
              onChange={(e) => setReport(e.target.value as typeof report)}
            >
              {REPORTS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button onClick={() => refetch()}>Run</Button>
          <a href={exportUrl(`/reports/${report}`, { from, to, format: 'csv' })}>
            <Button variant="secondary">Export CSV</Button>
          </a>
          <a href={exportUrl(`/reports/${report}`, { from, to, format: 'xlsx' })}>
            <Button variant="secondary">Export XLSX</Button>
          </a>
        </div>
      </Card>

      <Card>
        <CardTitle>{REPORTS.find((r) => r.value === report)?.label}</CardTitle>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label={`${REPORTS.find((r) => r.value === report)?.label} table`}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                {columns.map((c) => (
                  <th key={c} className="py-2 pr-4">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  {columns.map((c) => (
                    <td key={c} className="py-2 pr-4">
                      {String(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
              {data?.rows?.length === 0 && (
                <tr>
                  <td colSpan={columns.length || 1} className="py-4 text-center text-slate-500">
                    No data for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
