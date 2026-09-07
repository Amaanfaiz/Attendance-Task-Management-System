import clsx from 'clsx';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx('rounded-lg border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>;
}
