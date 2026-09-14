'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMinutes } from '@/lib/use-reconciliation';

// The three segments sum to the full clocked-in period: gross elapsed time =
// task time + unallocated time + break time (BR-008/009/010). Net working
// time (the "Worked" stat elsewhere on the page) is task + unallocated only -
// breaks are already excluded from it - so this donut deliberately shows the
// whole clocked-in day, not just net working time, to make that distinction
// visible rather than implicit.
interface DayBreakdownChartProps {
  taskMinutes: number;
  breakMinutes: number;
  unallocatedMinutes: number;
}

const COLORS = {
  task: '#534ab7',
  unallocated: '#94a3b8',
  break: '#f59e0b',
};

export function DayBreakdownChart({ taskMinutes, breakMinutes, unallocatedMinutes }: DayBreakdownChartProps) {
  const data = [
    { key: 'task', name: 'Task time', minutes: Math.max(0, taskMinutes), color: COLORS.task },
    { key: 'unallocated', name: 'Unallocated', minutes: Math.max(0, unallocatedMinutes), color: COLORS.unallocated },
    { key: 'break', name: 'Break time', minutes: Math.max(0, breakMinutes), color: COLORS.break },
  ];
  const total = data.reduce((sum, d) => sum + d.minutes, 0);

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        No time recorded yet today.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="minutes"
              nameKey="name"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={data.filter((d) => d.minutes > 0).length > 1 ? 2 : 0}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatMinutes(Number(value)), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-slate-900">{formatMinutes(total)}</span>
          <span className="text-[11px] text-slate-500">clocked in</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden="true" />
            <span className="text-slate-600">{d.name}</span>
            <span className="font-mono tabular-nums font-medium text-slate-900">{formatMinutes(d.minutes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
