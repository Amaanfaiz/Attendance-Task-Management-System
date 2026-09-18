'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { RotateCw, Download, FileSpreadsheet, CalendarClock, ListTodo, AlertTriangle, Coffee } from 'lucide-react';
import { UserStatus } from '@atms/shared';
import { api, exportUrl } from '@/lib/api-client';
import { useDepartments } from '@/lib/use-departments';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { UnallocatedByEmployeeChart } from '@/components/charts/unallocated-by-employee-chart';

interface TaskOption {
  id: string;
  title: string;
}

// Exactly the 4 report families the API actually has (GET /reports/attendance,
// /task-time, /unallocated, /breaks) - shown as an explicit tab row rather
// than a plain dropdown so this reads as "there are 4 kinds of report", not
// as a long menu that invites assuming more exist.
const REPORTS = [
  { value: 'attendance', label: 'Daily Attendance', icon: CalendarClock },
  { value: 'task-time', label: 'Task Time', icon: ListTodo },
  { value: 'unallocated', label: 'Unallocated Time', icon: AlertTriangle },
  { value: 'breaks', label: 'Breaks', icon: Coffee },
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

interface BreakRow {
  date: string;
  employee: string;
  start: string;
  end: string;
  durationMinutes: number;
  status: string;
}

interface UnallocatedRow {
  date: string;
  employee: string;
  netWorkingMinutes: number;
  taskMinutes: number;
  unallocatedMinutes: number;
  dataQualityException: boolean;
}

interface UserOption {
  id: string;
  firstName: string;
  surname: string;
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
  const [userId, setUserId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [taskId, setTaskId] = useState('');

  const { data: users } = useQuery({
    queryKey: ['users', 'admin', 'active-for-reports'],
    queryFn: () => api.get<UserOption[]>('/users', { status: UserStatus.ACTIVE }),
  });
  const { data: departments } = useDepartments();
  // GET /reports/task-time already accepted a taskId param with no picker for it -
  // found via API-vs-UI audit. Only fetched for the task-time report, not on
  // every page load.
  const { data: tasksForFilter } = useQuery({
    queryKey: ['tasks', 'all', 'for-report-filter'],
    queryFn: () => api.get<TaskOption[]>('/tasks', { scope: 'all' }),
    enabled: report === 'task-time',
  });

  // Only the attendance report accepts departmentId, only task-time accepts taskId -
  // matching the reports controller's per-endpoint query params exactly.
  const extraParams = {
    ...(userId ? { userId } : {}),
    ...(report === 'attendance' && departmentId ? { departmentId } : {}),
    ...(report === 'task-time' && taskId ? { taskId } : {}),
  };

  // AC-004-006-01: the breaks (and every other) report already supported a
  // userId filter server-side, but this page never exposed a way to pick one.
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reports', report, from, to, userId, departmentId, taskId],
    queryFn: () =>
      api.get<{ rows: Record<string, unknown>[] }>(`/reports/${report}`, {
        from,
        to,
        format: 'json',
        ...extraParams,
      }),
  });

  const columns = data?.rows?.[0] ? Object.keys(data.rows[0]) : [];

  // AC-004-006-02: the breaks report only ever listed individual break
  // periods, never the daily totals this AC also asks for.
  const breakDailyTotals = useMemo(() => {
    if (report !== 'breaks' || !data?.rows) return [];
    const rows = data.rows as unknown as BreakRow[];
    const byDate = new Map<string, { date: string; count: number; totalMinutes: number; hasActive: boolean }>();
    for (const r of rows) {
      const existing = byDate.get(r.date) ?? { date: r.date, count: 0, totalMinutes: 0, hasActive: false };
      existing.count += 1;
      existing.totalMinutes += r.durationMinutes;
      existing.hasActive = existing.hasActive || r.status === 'ACTIVE';
      byDate.set(r.date, existing);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [report, data]);

  // AC-010-004-01/03: aggregates the same rows the table below shows (respecting
  // the hide-zero-unallocated toggle) into one bar per employee, since the raw
  // per-session table on its own doesn't make "who has the most unallocated
  // time this period" fast to answer at a glance.
  const unallocatedByEmployee = useMemo(() => {
    if (report !== 'unallocated' || !data?.rows) return [];
    const rows = data.rows as unknown as UnallocatedRow[];
    const byEmployee = new Map<string, { employee: string; unallocatedMinutes: number; hasException: boolean }>();
    for (const r of rows) {
      if (hideZeroUnallocated && r.unallocatedMinutes === 0) continue;
      const existing = byEmployee.get(r.employee) ?? { employee: r.employee, unallocatedMinutes: 0, hasException: false };
      existing.unallocatedMinutes += r.unallocatedMinutes;
      existing.hasException = existing.hasException || r.dataQualityException;
      byEmployee.set(r.employee, existing);
    }
    return Array.from(byEmployee.values());
  }, [report, data, hideZeroUnallocated]);

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

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const active = report === r.value;
          return (
            <button
              key={r.value}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setReport(r.value);
                setSummaryView(false);
                setDrilldownEmployee(null);
                setDepartmentId('');
                setTaskId('');
              }}
              className={clsx(
                'inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
              )}
            >
              <Icon size={16} aria-hidden="true" />
              {r.label}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Employee">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">All employees</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.surname}
                </option>
              ))}
            </Select>
          </Field>
          {report === 'attendance' && (
            <Field label="Department">
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">All departments</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {report === 'task-time' && (
            <Field label="Task">
              <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">All tasks</option>
                {(tasksForFilter ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* The table below already re-fetches automatically whenever any filter
                above changes (they're all part of this query's key) - this button
                only re-runs the *same* filters, e.g. to pull in records recorded
                since the page loaded. Labeled to match that, not "Run", which
                implied filters were otherwise inert until clicked. */}
            <Button icon={<RotateCw size={16} aria-hidden="true" />} variant="secondary" onClick={() => refetch()}>Refresh</Button>
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
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">Export:</span>
            <a href={exportUrl(`/reports/${report}`, { from, to, format: 'csv', ...extraParams })}>
              <Button icon={<Download size={16} aria-hidden="true" />} variant="secondary">CSV</Button>
            </a>
            <a href={exportUrl(`/reports/${report}`, { from, to, format: 'xlsx', ...extraParams })}>
              <Button icon={<FileSpreadsheet size={16} aria-hidden="true" />} variant="secondary">XLSX</Button>
            </a>
          </div>
        </div>
      </Card>

      {report === 'attendance' && summaryView && !drilldownEmployee && (
        <Card>
          <CardTitle>Totals by employee, {from} – {to}</CardTitle>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Attendance summary by employee">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4 text-right">Days</th>
                  <th className="py-2 pr-4 text-right">Total net work (min)</th>
                  <th className="py-2 pr-4 text-right">Total break (min)</th>
                  <th className="py-2 pr-4 text-right">Incomplete days</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {employeeSummary.map((row) => (
                  <tr key={row.employee} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-medium text-slate-900">{row.employee}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-600">{row.days}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-900">{row.netWorkingMinutes}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-900">{row.breakMinutes}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-600">{row.incompleteCount || '—'}</td>
                    <td className="py-2.5 pr-4">
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

      {report === 'unallocated' && (
        <Card>
          <CardTitle>Unallocated time by employee, {from} – {to}</CardTitle>
          {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          <UnallocatedByEmployeeChart rows={unallocatedByEmployee} />
          {unallocatedByEmployee.some((r) => r.hasException) && (
            <p className="mt-2 text-xs text-red-600">
              Red bars have a data-quality exception (task time appears to exceed attendance time) — check before acting on the number.
            </p>
          )}
        </Card>
      )}

      {report === 'breaks' && (
        <Card>
          <CardTitle>Daily totals, {from} – {to}</CardTitle>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Break daily totals">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4 text-right">Breaks</th>
                  <th className="py-2 pr-4 text-right">Total minutes</th>
                  <th className="py-2 pr-4">Has active break</th>
                </tr>
              </thead>
              <tbody>
                {breakDailyTotals.map((row) => (
                  <tr key={row.date} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-medium text-slate-900">{row.date}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-600">{row.count}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-900">{row.totalMinutes}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{row.hasActive ? 'Yes' : '—'}</td>
                  </tr>
                ))}
                {breakDailyTotals.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-500">
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
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  {displayedColumns.map((c) => (
                    <th key={c} className={clsx('py-2 pr-4', typeof displayedRows[0]?.[c] === 'number' && 'text-right')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                    {displayedColumns.map((c) => {
                      const isNumeric = typeof row[c] === 'number';
                      return (
                        <td
                          key={c}
                          className={clsx(
                            'py-2.5 pr-4',
                            isNumeric ? 'text-right font-mono tabular-nums text-slate-900' : 'text-slate-700',
                          )}
                        >
                          {String(row[c] ?? '')}
                        </td>
                      );
                    })}
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
