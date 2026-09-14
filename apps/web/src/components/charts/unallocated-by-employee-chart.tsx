'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatMinutes } from '@/lib/use-reconciliation';

export interface UnallocatedByEmployeeRow {
  employee: string;
  unallocatedMinutes: number;
  hasException: boolean;
}

// AC-010-004-01/03: this is the one report admins most want a fast visual
// read on - who has the most unallocated time over the period - rather than
// scanning a raw per-session table row by row. Sorted descending so the
// employees most worth a conversation are at the top, and rows flagged with
// a data-quality exception (US-007-004) get a distinct color rather than
// blending in, since those aren't just "forgot to log a task" - they're
// impossible values worth checking before acting on.
export function UnallocatedByEmployeeChart({ rows }: { rows: UnallocatedByEmployeeRow[] }) {
  const sorted = [...rows].sort((a, b) => b.unallocatedMinutes - a.unallocatedMinutes);
  const height = Math.max(120, sorted.length * 36 + 24);

  if (sorted.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-slate-500">
        No data for this period.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatMinutes(v)}
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            type="category"
            dataKey="employee"
            width={140}
            tick={{ fontSize: 12, fill: '#334155' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <Tooltip
            formatter={(value) => formatMinutes(Number(value))}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <Bar dataKey="unallocatedMinutes" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {sorted.map((row) => (
              <Cell key={row.employee} fill={row.hasException ? '#dc2626' : '#534ab7'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
