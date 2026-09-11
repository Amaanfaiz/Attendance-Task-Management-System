'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserRole } from '@atms/shared';
import { useCurrentUser } from '@/lib/use-current-user';

export default function RootPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !data) {
      router.replace('/login');
    } else {
      // RISK-015: same reasoning as the login page - Auditor has no
      // attendance/tasks of its own, so /my-day isn't its home.
      router.replace(data.role === UserRole.AUDITOR ? '/admin/reports' : '/my-day');
    }
  }, [isLoading, isError, data, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Loading…
    </div>
  );
}
