'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useDepartments } from '@/lib/use-departments';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function durationSince(clockInAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(clockInAt).getTime()) / 60000));
  return formatMinutes(minutes);
}

interface LiveRow {
  id: string;
  clockInAt: string;
  status: 'ACTIVE' | 'ON_BREAK';
  user: { id: string; firstName: string; surname: string; email: string; department: { id: string; name: string } | null };
  currentTask: { task: { title: string } } | null;
}

// AC-008-003-04: search by name/email and filter by department. The live list is
// always small (only people currently clocked in), so filtering client-side over
// the already-fetched rows is simpler than adding server-side query params for
// what's fundamentally a small, frequently-refetched dataset.
export default function LiveAttendancePage() {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'admin', 'live'],
    queryFn: () => api.get<LiveRow[]>('/attendance/admin/live'),
    refetchInterval: 15_000,
  });
  const { data: departments } = useDepartments();

  const rows = (data ?? []).filter((row) => {
    const matchesSearch = search
      ? `${row.user.firstName} ${row.user.surname} ${row.user.email}`.toLowerCase().includes(search.toLowerCase())
      : true;
    const matchesDept = departmentId ? row.user.department?.id === departmentId : true;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Live Attendance</h1>
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor="live-search" className="text-sm text-slate-600">
            Search:
          </label>
          <input
            id="live-search"
            type="text"
            placeholder="Name or email"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label htmlFor="live-department" className="ml-2 text-sm text-slate-600">
            Department:
          </label>
          <select
            id="live-department"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">All</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Live attendance table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Clocked in since</th>
                <th className="py-2 pr-4">Duration</th>
                <th className="py-2 pr-4">Current task</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    {row.user.firstName} {row.user.surname}
                  </td>
                  <td className="py-2 pr-4">{row.user.department?.name ?? '—'}</td>
                  <td className="py-2 pr-4">
                    {row.status === 'ON_BREAK' ? <Badge color="amber">On Break</Badge> : <Badge color="green">Working</Badge>}
                  </td>
                  <td className="py-2 pr-4">{new Date(row.clockInAt).toLocaleTimeString()}</td>
                  <td className="py-2 pr-4">{durationSince(row.clockInAt)}</td>
                  <td className="py-2 pr-4">{row.currentTask?.task.title ?? '—'}</td>
                </tr>
              ))}
              {data && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    {data.length === 0 ? 'Nobody is currently clocked in.' : 'No one matches this search/filter.'}
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
