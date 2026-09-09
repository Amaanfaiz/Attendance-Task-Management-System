'use client';

import Link from 'next/link';
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
            <Kpi label="Active Users" value={data.totalActiveUsers} href="/admin/users?status=ACTIVE" />
            <Kpi label="Working" value={data.working} accent="text-green-600" href="/admin/live" />
            <Kpi label="On Break" value={data.onBreak} accent="text-amber-600" href="/admin/live" />
            <Kpi label="Not Clocked In" value={data.notClockedIn} accent="text-slate-500" href="/admin/users?status=ACTIVE" />
            <Kpi label="Active Task Timers" value={data.runningTaskTimers} accent="text-blue-600" href="/admin/live" />
          </div>
          <Card>
            <CardTitle>Tasks by Status</CardTitle>
            <div className="flex flex-wrap gap-4">
              {Object.entries(data.tasksByStatus).map(([status, count]) => (
                <Link
                  key={status}
                  href={`/admin/tasks?status=${status}`}
                  className="text-sm hover:underline"
                >
                  <span className="font-semibold text-slate-900">{count}</span>{' '}
                  <span className="text-slate-500">{status.replace('_', ' ')}</span>
                </Link>
              ))}
              <Link href="/admin/tasks?overdue=1" className="text-sm hover:underline">
                <span className="font-semibold text-red-600">{data.overdueTaskCount}</span>{' '}
                <span className="text-slate-500">overdue</span>
              </Link>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// AC-008-002-04 / AC-008-004-03: every KPI is a real link to the matching
// filtered detail view - found via AC testing that none of these were
// clickable at all, just static numbers with nowhere to drill down to.
function Kpi({ label, value, accent, href }: { label: string; value: number; accent?: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className={'text-2xl font-semibold ' + (accent ?? 'text-slate-900')}>{value}</p>
      </Card>
    </Link>
  );
}
