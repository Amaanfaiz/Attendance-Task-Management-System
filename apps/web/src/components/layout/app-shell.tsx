'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { UserRole } from '@atms/shared';
import { useCurrentUser } from '@/lib/use-current-user';
import { api } from '@/lib/api-client';
import { GlobalTimerBar } from './global-timer-bar';
import { NotificationBell } from './notification-bell';

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
  { href: '/admin/settings', label: 'Settings' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useCurrentUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // AC-001-007-04: a user redirected here after having been signed in (session
  // expired mid-use) should see a clear reason, not the same blank login page
  // as someone who was never signed in. sessionStorage (not a React ref) because
  // this has to survive a full page reload/navigation, not just SPA client state
  // — a ref alone is empty again on the very first render after e.g. reopening
  // the tab, which is exactly when a real expired session is most likely to be
  // discovered.
  if (user) {
    try {
      sessionStorage.setItem('atms_had_session', '1');
    } catch {
      /* sessionStorage unavailable (e.g. private browsing) — degrade silently */
    }
  }

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      let hadSession = false;
      try {
        hadSession = sessionStorage.getItem('atms_had_session') === '1';
        sessionStorage.removeItem('atms_had_session');
      } catch {
        /* sessionStorage unavailable — fall through with hadSession = false */
      }
      router.replace(hadSession ? '/login?expired=1' : '/login');
    }
  }, [isLoading, isError, user, router]);

  // Close the mobile menu automatically whenever the route changes.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  const links = user.role === UserRole.ADMINISTRATOR ? [...employeeLinks, ...adminLinks] : employeeLinks;

  const logout = async () => {
    await api.post('/auth/logout');
    queryClient.clear();
    try {
      sessionStorage.removeItem('atms_had_session');
    } catch {
      /* sessionStorage unavailable — nothing to clear */
    }
    router.replace('/login');
  };

  const navLink = (link: { href: string; label: string }) => (
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
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-semibold text-slate-900">ATMS</div>
        <nav className="flex flex-1 flex-col gap-1">{links.map(navLink)}</nav>
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
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="rounded-md border border-slate-300 p-1.5 text-slate-700 md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <GlobalTimerBar />
          </div>
          <NotificationBell />
          <button onClick={logout} className="shrink-0 text-xs text-slate-500 underline md:hidden">
            Log out
          </button>
        </header>
        {mobileMenuOpen && (
          <nav className="flex flex-col gap-1 border-b border-slate-200 bg-white p-3 md:hidden">
            {links.map(navLink)}
          </nav>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
