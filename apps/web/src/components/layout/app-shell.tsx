'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { UserRole } from '@atms/shared';
import { useCurrentUser } from '@/lib/use-current-user';
import { api } from '@/lib/api-client';
import { GlobalTimerBar } from './global-timer-bar';

const employeeLinks = [
  { href: '/my-day', label: 'My Day' },
  { href: '/tasks', label: 'My Tasks' },
  { href: '/attendance', label: 'Attendance History' },
  { href: '/corrections', label: 'My Corrections' },
  { href: '/profile', label: 'Profile' },
];

const adminLinks = [
  { href: '/admin/dashboard', label: 'Admin Dashboard' },
  { href: '/admin/live', label: 'Live Attendance' },
  { href: '/admin/users', label: 'User Management' },
  { href: '/admin/tasks', label: 'Task Management' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/corrections', label: 'Correction Review' },
  { href: '/admin/audit', label: 'Audit Log' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace('/login');
    }
  }, [isLoading, isError, user, router]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  const links = user.role === UserRole.ADMINISTRATOR ? [...employeeLinks, ...adminLinks] : employeeLinks;

  const logout = async () => {
    await api.post('/auth/logout');
    queryClient.clear();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-semibold text-slate-900">ATMS</div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'rounded-md px-3 py-2 text-sm font-medium',
                pathname === link.href ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 pt-3 text-sm">
          <p className="font-medium text-slate-900">
            {user.firstName} {user.surname}
          </p>
          <p className="text-xs text-slate-500">{user.role}</p>
          <button onClick={logout} className="mt-2 text-xs text-slate-500 underline hover:text-slate-800">
            Log out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <GlobalTimerBar />
          <button onClick={logout} className="text-xs text-slate-500 underline md:hidden">
            Log out
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
