'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface LiveRow {
  id: string;
  clockInAt: string;
  status: 'ACTIVE' | 'ON_BREAK';
  user: { id: string; firstName: string; surname: string; email: string };
  currentTask: { task: { title: string } } | null;
}

export default function LiveAttendancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'admin', 'live'],
    queryFn: () => api.get<LiveRow[]>('/attendance/admin/live'),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Live Attendance</h1>
      <Card>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Clocked in since</th>
                <th className="py-2 pr-4">Current task</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    {row.user.firstName} {row.user.surname}
                  </td>
                  <td className="py-2 pr-4">
                    {row.status === 'ON_BREAK' ? <Badge color="amber">On Break</Badge> : <Badge color="green">Working</Badge>}
                  </td>
                  <td className="py-2 pr-4">{new Date(row.clockInAt).toLocaleTimeString()}</td>
                  <td className="py-2 pr-4">{row.currentTask?.task.title ?? '—'}</td>
                </tr>
              ))}
              {data && data.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    Nobody is currently clocked in.
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
