import clsx from 'clsx';

const colorMap: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-700',
};

export function Badge({ color = 'slate', children }: { color?: keyof typeof colorMap; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', colorMap[color])}>
      {children}
    </span>
  );
}
