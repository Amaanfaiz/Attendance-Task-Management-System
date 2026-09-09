'use client';

import { useMemo, useState } from 'react';
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

interface AttendanceRow {
  date: string;
  employee: string;
  email: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  netWorkingMinutes: number;
  incomplete: boolean;
}

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

// AC-010-002-01/02/03/04: the attendance report only ever showed one row per
// session (raw daily detail) - there was no aggregated-by-employee view and
// no drill-down at all, found via AC testing. Reuses the same already-fetched
// attendance rows rather than a new endpoint: summing them client-side is
// exactly "aggregate totals reconcile to daily records" by construction,
// since the summary IS a sum of the visible daily rows.
// AC-010-004-02: the unallocated-time report had no way to include/exclude
// zero-unallocated days either - also found via AC testing, fixed the same way.
export default function ReportsPage() {
  const [report, setReport] = useState<(typeof REPORTS)[number]['value']>('attendance');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [summaryView, setSummaryView] = useState(false);
  const [drilldownEmployee, setDrilldownEmployee] = useState<string | null>(null);
  const [hideZeroUnallocated, setHideZeroUnallocated] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reports', report, from, to],
    queryFn: () =>
      api.get<{ rows: Record<string, unknown>[] }>(`/reports/${report}`, { from, to, format: 'json' }),
  });

  const columns = data?.rows?.[0] ? Object.keys(data.rows[0]) : [];

  const employeeSummary = useMemo(() => {
    if (report !== 'attendance' || !data?.rows) return [];
    const rows = data.rows as unknown as AttendanceRow[];
    const byEmployee = new Map<string, { employee: string; days: number; netWorkingMinutes: number; breakMinutes: number; incompleteCount: number }>();
    for (const r of rows) {
      const existing = byEmployee.get(r.employee) ?? { employee: r.employee, days: 0, netWorkingMinutes: 0, breakMinutes: 0, incompleteCount: 0 };
      existing.days += 1;
      existing.netWorkingMinutes += r.netWorkingMinutes;
      existing.breakMinutes += r.breakMinutes;
      existing.incompleteCount += r.incomplete ? 1 : 0;
      byEmployee.set(r.employee, existing);
    }
    return Array.from(byEmployee.values()).sort((a, b) => a.employee.localeCompare(b.employee));
  }, [report, data]);

  const displayedRows: Record<string, unknown>[] = (drilldownEmployee
    ? (data?.rows ?? []).filter((r) => r.employee === drilldownEmployee)
    : (data?.rows ?? [])
  ).filter((r) =>
    report === 'unallocated' && hideZeroUnallocated ? (r.unallocatedMinutes as number) !== 0 : true,
  );
  const displayedColumns = columns;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Report">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={report}
              onChange={(e) => {
                setReport(e.target.value as typeof report);
                setSummaryView(false);
                setDrilldownEmployee(null);
              }}
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
          {report === 'attendance' && (
            <Button
              variant="secondary"
              onClick={() => {
                setSummaryView((v) => !v);
                setDrilldownEmployee(null);
              }}
            >
              {summaryView ? 'Show daily detail' : 'Summarise by employee'}
            </Button>
          )}
          {report === 'unallocated' && (
            <Button
              variant="secondary"
              onClick={() => setHideZeroUnallocated((v) => !v)}
            >
              {hideZeroUnallocated ? 'Show zero-unallocated days' : 'Hide zero-unallocated days'}
            </Button>
          )}
        </div>
      </Card>

      {report === 'attendance' && summaryView && !drilldownEmployee && (
        <Card>
          <CardTitle>Totals by employee, {from} – {to}</CardTitle>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Attendance summary by employee">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Days</th>
                  <th className="py-2 pr-4">Total net work (min)</th>
                  <th className="py-2 pr-4">Total break (min)</th>
                  <th className="py-2 pr-4">Incomplete days</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {employeeSummary.map((row) => (
                  <tr key={row.employee} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{row.employee}</td>
                    <td className="py-2 pr-4">{row.days}</td>
                    <td className="py-2 pr-4">{row.netWorkingMinutes}</td>
                    <td className="py-2 pr-4">{row.breakMinutes}</td>
                    <td className="py-2 pr-4">{row.incompleteCount || '—'}</td>
                    <td className="py-2 pr-4">
                      <button
                        className="text-slate-600 underline hover:text-slate-900"
                        onClick={() => setDrilldownEmployee(row.employee)}
                      >
                        View daily detail
                      </button>
                    </td>
                  </tr>
                ))}
                {employeeSummary.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      No data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(!summaryView || drilldownEmployee) && (
        <Card>
          <CardTitle>
            {drilldownEmployee
              ? `${drilldownEmployee} — daily detail`
              : REPORTS.find((r) => r.value === report)?.label}
          </CardTitle>
          {drilldownEmployee && (
            <button
              className="mb-3 text-sm text-slate-600 underline hover:text-slate-900"
              onClick={() => setDrilldownEmployee(null)}
            >
              ← Back to summary
            </button>
          )}
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
                  {displayedColumns.map((c) => (
                    <th key={c} className="py-2 pr-4">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    {displayedColumns.map((c) => (
                      <td key={c} className="py-2 pr-4">
                        {String(row[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
                {displayedRows.length === 0 && (
                  <tr>
                    <td colSpan={displayedColumns.length || 1} className="py-4 text-center text-slate-500">
                      No data for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
