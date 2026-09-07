'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';

interface Kpis {
  totalActiveUsers: number;
  working: number;
  onBreak: number;
  notClockedIn: number;
  runningTaskTimers: number;
  tasksByStatus: Record<string, number>;
  overdueTaskCount: number;
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'admin', 'kpis'],
    queryFn: () => api.get<Kpis>('/dashboard/admin/kpis'),
    refetchInterval: 20_000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Administrator Dashboard</h1>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Active Users" value={data.totalActiveUsers} />
            <Kpi label="Working" value={data.working} accent="text-green-600" />
            <Kpi label="On Break" value={data.onBreak} accent="text-amber-600" />
            <Kpi label="Not Clocked In" value={data.notClockedIn} accent="text-slate-500" />
            <Kpi label="Active Task Timers" value={data.runningTaskTimers} accent="text-blue-600" />
          </div>
          <Card>
            <CardTitle>Tasks by Status</CardTitle>
            <div className="flex flex-wrap gap-4">
              {Object.entries(data.tasksByStatus).map(([status, count]) => (
                <div key={status} className="text-sm">
                  <span className="font-semibold text-slate-900">{count}</span>{' '}
                  <span className="text-slate-500">{status.replace('_', ' ')}</span>
                </div>
              ))}
              <div className="text-sm">
                <span className="font-semibold text-red-600">{data.overdueTaskCount}</span>{' '}
                <span className="text-slate-500">overdue</span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={'text-2xl font-semibold ' + (accent ?? 'text-slate-900')}>{value}</p>
    </Card>
  );
}
