'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users, CircleCheck, Coffee, UserX, Timer, AlertTriangle, CircleCheckBig, type LucideIcon } from 'lucide-react';
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
  missedClockOutCount: number;
  dataQualityExceptionCount: number;
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
            <Kpi icon={Users} label="Active Users" value={data.totalActiveUsers} href="/admin/users?status=ACTIVE" />
            <Kpi icon={CircleCheck} label="Working" value={data.working} accent="text-green-600" href="/admin/live" />
            <Kpi icon={Coffee} label="On Break" value={data.onBreak} accent="text-amber-600" href="/admin/live" />
            <Kpi icon={UserX} label="Not Clocked In" value={data.notClockedIn} accent="text-slate-500" href="/admin/users?status=ACTIVE" />
            <Kpi icon={Timer} label="Active Task Timers" value={data.runningTaskTimers} accent="text-blue-600" href="/admin/live" />
          </div>
          <Card>
            <CardTitle>Attention Required</CardTitle>
            {data.missedClockOutCount === 0 && data.dataQualityExceptionCount === 0 && data.overdueTaskCount === 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <CircleCheckBig size={16} className="text-green-600" aria-hidden="true" />
                No operational exceptions right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.missedClockOutCount > 0 && (
                  <AttentionItem
                    href="/admin/live"
                    label={`${data.missedClockOutCount} missed clock-out${data.missedClockOutCount === 1 ? '' : 's'}`}
                    detail="Session still open from a previous day"
                  />
                )}
                {data.dataQualityExceptionCount > 0 && (
                  <AttentionItem
                    href="/admin/reports"
                    label={`${data.dataQualityExceptionCount} data quality exception${data.dataQualityExceptionCount === 1 ? '' : 's'}`}
                    detail="Impossible reconciliation - task time exceeds recorded attendance"
                  />
                )}
                {data.overdueTaskCount > 0 && (
                  <AttentionItem
                    href="/admin/tasks?overdue=1"
                    label={`${data.overdueTaskCount} overdue task${data.overdueTaskCount === 1 ? '' : 's'}`}
                    detail="Past due date and not completed or cancelled"
                  />
                )}
              </ul>
            )}
          </Card>
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

function AttentionItem({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="flex items-start gap-2 rounded-md p-2 hover:bg-amber-50">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          <span className="block text-sm font-medium text-slate-900">{label}</span>
          <span className="block text-xs text-slate-500">{detail}</span>
        </span>
      </Link>
    </li>
  );
}

// AC-008-002-04 / AC-008-004-03: every KPI is a real link to the matching
// filtered detail view - found via AC testing that none of these were
// clickable at all, just static numbers with nowhere to drill down to.
function Kpi({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  accent?: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <div className="mb-1 flex items-center gap-1.5">
          <Icon size={14} strokeWidth={2} className={accent ?? 'text-slate-400'} aria-hidden="true" />
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        </div>
        <p className={'text-2xl font-semibold ' + (accent ?? 'text-slate-900')}>{value}</p>
      </Card>
    </Link>
  );
}
