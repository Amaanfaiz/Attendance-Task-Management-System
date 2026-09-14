import clsx from 'clsx';

const colorMap: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
  brand: 'bg-brand-100 text-brand-700',
};

const dotColorMap: Record<string, string> = {
  slate: 'bg-slate-400',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  brand: 'bg-brand-600',
};

// `dot` marks this badge as a live/current state (e.g. attendance or task
// status) rather than a static attribute like priority - the leading dot is
// what makes a whole column of these scannable as "state" at a glance,
// distinct from plain colored-label badges.
export function Badge({
  color = 'slate',
  dot = false,
  children,
}: {
  color?: keyof typeof colorMap;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', colorMap[color])}>
      {dot && <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', dotColorMap[color])} aria-hidden="true" />}
      {children}
    </span>
  );
}
