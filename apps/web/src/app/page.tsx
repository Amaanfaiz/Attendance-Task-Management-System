'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/use-current-user';

export default function RootPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !data) {
      router.replace('/login');
    } else {
      router.replace('/my-day');
    }
  }, [isLoading, isError, data, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Loading…
    </div>
  );
}
