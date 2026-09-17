import { LogIn, CircleCheck, Coffee, Code2, LogOut } from 'lucide-react';

const timelineSteps = [
  { icon: LogIn, label: 'Clock In', time: '09:00', color: 'bg-green-600' },
  { icon: CircleCheck, label: 'Task Time', time: '09:15', color: 'bg-brand-600' },
  { icon: Coffee, label: 'Break', time: '13:00', color: 'bg-slate-300 text-slate-600' },
  { icon: Code2, label: 'Task Time', time: '14:00', color: 'bg-brand-600' },
  { icon: LogOut, label: 'Clock Out', time: '18:00', color: 'bg-slate-300 text-slate-600' },
];

// Illustrative sample data only - shown to a signed-out visitor, so it can't
// be a real user's timeline. Same shift-telemetry shape My Day renders once
// signed in (clock/task/break events, Net Work/Task/Unallocated totals).
function BrandPanel() {
  return (
    <div className="hidden max-w-lg flex-1 flex-col justify-center gap-6 lg:flex">
      <span className="inline-flex w-fit items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
        Unified Audit &amp; Attendance
      </span>
      <h2 className="text-3xl font-semibold leading-tight text-slate-900">
        Attendance and task-time records in one trusted workspace
      </h2>
      <p className="text-slate-600">
        Synchronize shift punches, active task allocations, and break telemetry with verified operational precision.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shift Telemetry Timeline</p>
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">08h 30m Logged</span>
        </div>
        <div className="flex items-start justify-between">
          {timelineSteps.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5 text-center">
              <span className={'flex h-8 w-8 items-center justify-center rounded-full text-white ' + step.color}>
                <step.icon size={16} aria-hidden="true" />
              </span>
              <span className="text-xs font-medium text-slate-700">{step.label}</span>
              <span className="text-xs text-slate-400">{step.time}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/3 bg-brand-600" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-600" /> Task: 5h 45m
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-600" /> Net Work: 7h 30m
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-300" /> Unallocated: 1h 00m
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center gap-3 px-6 py-5 sm:px-10">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <LogIn size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold text-slate-900">ATMS</p>
          <p className="text-xs text-slate-500">Enterprise Workforce Suite</p>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center gap-16 px-6 pb-12 sm:px-10">
        <BrandPanel />
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-md">{children}</div>
        </div>
      </main>
      <footer className="px-6 py-4 text-xs text-slate-400 sm:px-10">
        &copy; {new Date().getFullYear()} ATMS. All rights reserved.
      </footer>
    </div>
  );
}
