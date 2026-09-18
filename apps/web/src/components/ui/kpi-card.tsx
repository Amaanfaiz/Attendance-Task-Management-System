import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

// Shared by Admin Dashboard and Live Attendance - both show the same shape of
// workforce KPI tile, and Live Attendance reuses GET /dashboard/admin/kpis
// directly rather than recomputing these counts client-side, so the two
// screens can never drift out of sync with each other.
export function KpiCard({
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
  href?: string;
}) {
  const content = (
    <Card className={href ? 'transition-shadow hover:shadow-md' : undefined}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon size={14} strokeWidth={2} className={accent ?? 'text-slate-400'} aria-hidden="true" />
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className={'text-2xl font-semibold ' + (accent ?? 'text-slate-900')}>{value}</p>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
