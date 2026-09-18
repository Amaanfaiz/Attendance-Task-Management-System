'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserRole } from '@atms/shared';
import { CircleCheck, Coffee, UserX, Timer } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { useDepartments } from '@/lib/use-departments';
import { buildSessionTimeline, formatMinutes } from '@/lib/use-reconciliation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Drawer } from '@/components/ui/drawer';
import { KpiCard } from '@/components/ui/kpi-card';

interface WorkforceKpis {
  working: number;
  onBreak: number;
  notClockedIn: number;
  runningTaskTimers: number;
}

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

interface SessionDetail {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  breaks: { id: string; startAt: string; endAt: string | null }[];
  taskTimeEntries: { id: string; startAt: string; endAt: string | null; task: { id: string; title: string } }[];
}

// GET /attendance/:id is now @AuditorAllowed() too - same read-only scope as
// this page's own list endpoint (admin/live), just one row's detail instead
// of the summary table. Amaan's call after flagging it as an open question:
// no reason a role that can already see the live list shouldn't see the
// breakdown behind one of its own rows.
function LiveAttendanceDrawer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { data: session } = useQuery({
    queryKey: ['attendance', 'session', sessionId],
    queryFn: () => api.get<SessionDetail>(`/attendance/${sessionId}`),
  });

  const built = session ? buildSessionTimeline(session) : null;

  return (
    <Drawer open onClose={onClose} title="Attendance detail" subtitle={session ? new Date(session.clockInAt).toLocaleDateString() : undefined}>
      {!session ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Clocked in</p>
            <p className="text-sm text-slate-900">
              {new Date(session.clockInAt).toLocaleTimeString()}
              {session.clockOutAt ? ` → ${new Date(session.clockOutAt).toLocaleTimeString()}` : ' → still active'}
            </p>
          </div>

          {built && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Net work</p>
                <p className="font-mono text-lg font-semibold tabular-nums text-slate-900">{formatMinutes(built.reconciliation.netWorkingMinutes)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Task time</p>
                <p className="font-mono text-lg font-semibold tabular-nums text-slate-900">{formatMinutes(built.reconciliation.taskMinutes)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Break time</p>
                <p className="font-mono text-lg font-semibold tabular-nums text-slate-900">{formatMinutes(built.reconciliation.breakMinutes)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Unallocated</p>
                <p className={'font-mono text-lg font-semibold tabular-nums ' + (built.reconciliation.hasDataQualityException ? 'text-red-600' : 'text-slate-900')}>
                  {formatMinutes(built.reconciliation.unallocatedMinutes)}
                </p>
              </div>
            </div>
          )}
          {built?.reconciliation.hasDataQualityException && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
              Data quality exception — task time appears to exceed attendance time.
            </p>
          )}

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Today&rsquo;s activity</p>
            {built && built.timeline.length === 0 ? (
              <p className="text-sm text-slate-500">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {built?.timeline.map((event, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-sm">
                    <span
                      className={
                        'h-2 w-2 shrink-0 rounded-full ' +
                        (event.type === 'ATTENDANCE' ? 'bg-green-500' : event.type === 'BREAK' ? 'bg-amber-500' : 'bg-blue-500')
                      }
                    />
                    <span className="w-16 shrink-0 text-slate-500">
                      {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-medium text-slate-800">{event.label}</span>
                    <span className="text-slate-500">
                      {event.end ? `→ ${new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '(ongoing)'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

// AC-008-003-04: search by name/email and filter by department. The live list is
// always small (only people currently clocked in), so filtering client-side over
// the already-fetched rows is simpler than adding server-side query params for
// what's fundamentally a small, frequently-refetched dataset.
export default function LiveAttendancePage() {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'admin', 'live'],
    queryFn: () => api.get<LiveRow[]>('/attendance/admin/live'),
    refetchInterval: 15_000,
  });
  const { data: departments } = useDepartments();
  const { data: currentUser } = useCurrentUser();
  // GET /attendance/:id is @AuditorAllowed() (same read-only scope as this
  // page's own list endpoint), so Auditor can open the detail drawer too -
  // but GET /dashboard/admin/kpis below stays Administrator-only server-side,
  // so it must not share this same flag or it'd 403 for Auditor.
  const isAdmin = currentUser?.role === UserRole.ADMINISTRATOR;
  const canInspect = isAdmin || currentUser?.role === UserRole.AUDITOR;
  // Reusing this endpoint here rather than recomputing the same four counts
  // client-side keeps this KPI row and the Admin Dashboard's always in agreement.
  const { data: kpis } = useQuery({
    queryKey: ['dashboard', 'admin', 'kpis'],
    queryFn: () => api.get<WorkforceKpis>('/dashboard/admin/kpis'),
    refetchInterval: 15_000,
    enabled: isAdmin,
  });

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
      {kpis && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard icon={CircleCheck} label="Working" value={kpis.working} accent="text-green-600" />
          <KpiCard icon={Coffee} label="On Break" value={kpis.onBreak} accent="text-amber-600" />
          <KpiCard icon={UserX} label="Not Clocked In" value={kpis.notClockedIn} accent="text-slate-500" />
          <KpiCard icon={Timer} label="Active Task Timers" value={kpis.runningTaskTimers} accent="text-blue-600" />
        </div>
      )}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor="live-search" className="text-sm text-slate-600">
            Search:
          </label>
          <div className="w-full sm:w-56">
            <Input
              id="live-search"
              type="text"
              placeholder="Name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label htmlFor="live-department" className="ml-2 text-sm text-slate-600">
            Department:
          </label>
          <Select
            id="live-department"
            uiSize="sm"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">All</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Live attendance table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Clocked in since</th>
                <th className="py-2 pr-4 text-right">Duration</th>
                <th className="py-2 pr-4">Current task</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={canInspect ? () => setSelectedSessionId(row.id) : undefined}
                  onKeyDown={
                    canInspect
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedSessionId(row.id);
                          }
                        }
                      : undefined
                  }
                  tabIndex={canInspect ? 0 : undefined}
                  className={
                    'border-b border-slate-100 hover:bg-slate-50' +
                    (canInspect ? ' cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset' : '')
                  }
                >
                  <td className="py-2.5 pr-4 font-medium text-slate-900">
                    {row.user.firstName} {row.user.surname}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">{row.user.department?.name ?? '—'}</td>
                  <td className="py-2.5 pr-4">
                    {row.status === 'ON_BREAK' ? (
                      <Badge color="amber" dot>On Break</Badge>
                    ) : (
                      <Badge color="green" dot>Working</Badge>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">{new Date(row.clockInAt).toLocaleTimeString()}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-900">{durationSince(row.clockInAt)}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{row.currentTask?.task.title ?? '—'}</td>
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
      {selectedSessionId && (
        <LiveAttendanceDrawer sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}
    </div>
  );
}
