'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Sun,
  ListTodo,
  History,
  CalendarClock,
  Wrench,
  User,
  LayoutDashboard,
  Radio,
  ClipboardList,
  Users,
  ListChecks,
  BarChart3,
  FileCheck,
  ScrollText,
  Settings,
  UserCog,
  FileX,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { UserRole } from '@atms/shared';
import { useCurrentUser } from '@/lib/use-current-user';
import { api } from '@/lib/api-client';
import { GlobalTimerBar } from './global-timer-bar';
import { NotificationBell } from './notification-bell';

const navIcons: Record<string, LucideIcon> = {
  '/my-day': Sun,
  '/tasks': ListTodo,
  '/tasks/history': History,
  '/attendance': CalendarClock,
  '/corrections': Wrench,
  '/profile': User,
  '/admin/dashboard': LayoutDashboard,
  '/admin/live': Radio,
  '/admin/attendance-logs': ClipboardList,
  '/admin/users': Users,
  '/admin/tasks': ListChecks,
  '/admin/reports': BarChart3,
  '/admin/corrections': FileCheck,
  '/admin/profile-changes': UserCog,
  '/admin/document-deletions': FileX,
  '/admin/audit': ScrollText,
  '/admin/settings': Settings,
};

const employeeLinks = [
  { href: '/my-day', label: 'My Day' },
  { href: '/tasks', label: 'My Tasks' },
  { href: '/tasks/history', label: 'Task Time History' },
  { href: '/attendance', label: 'Attendance History' },
  { href: '/corrections', label: 'My Corrections' },
  { href: '/profile', label: 'Profile' },
];

const adminLinks = [
  { href: '/admin/dashboard', label: 'Admin Dashboard' },
  { href: '/admin/live', label: 'Live Attendance' },
  { href: '/admin/attendance-logs', label: 'Attendance Logs' },
  { href: '/admin/users', label: 'User Management' },
  { href: '/admin/tasks', label: 'Task Management' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/corrections', label: 'Correction Review' },
  { href: '/admin/profile-changes', label: 'Profile Changes' },
  { href: '/admin/document-deletions', label: 'Document Deletions' },
  { href: '/admin/audit', label: 'Audit Log' },
  { href: '/admin/settings', label: 'Settings' },
];

// RISK-015: the Auditor role can reach exactly the read-only surfaces it's
// server-side authorised for (see AuditorScopeGuard) - not the full admin
// nav, and not the employee self-service links, since this role has no
// attendance/tasks of its own.
const auditorLinks = [
  { href: '/admin/live', label: 'Live Attendance' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/audit', label: 'Audit Log' },
  { href: '/profile', label: 'Profile' },
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

  const links =
    user.role === UserRole.ADMINISTRATOR
      ? [...employeeLinks, ...adminLinks]
      : user.role === UserRole.AUDITOR
        ? auditorLinks
        : employeeLinks;
  // Auditor has no attendance/notifications of its own - these would just 403
  // or show meaningless empty state, so they're not part of its UI at all.
  const showPersonalWidgets = user.role !== UserRole.AUDITOR;

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

  const navLink = (link: { href: string; label: string }) => {
    const Icon = navIcons[link.href];
    return (
      <Link
        key={link.href}
        href={link.href}
        className={clsx(
          'flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors',
          pathname === link.href
            ? 'border-brand-600 bg-brand-50 text-brand-700'
            : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        {Icon && <Icon size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />}
        {link.label}
      </Link>
    );
  };

  const initials = `${user.firstName?.[0] ?? ''}${user.surname?.[0] ?? ''}`.toUpperCase();

  return (
    // AC-008-005-03: was min-h-screen, so the container could grow taller than
    // the viewport and <main>'s own overflow-y-auto never engaged - the whole
    // page scrolled instead, dragging the header (and its timer/clock state)
    // out of view. h-screen bounds it so main scrolls internally and the
    // header stays fixed, as the AC requires.
    <div className="flex h-screen">
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
            AT
          </span>
          <span className="text-lg font-semibold text-slate-900">ATMS</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">{links.map(navLink)}</nav>
        <div className="flex items-center gap-2.5 border-t border-slate-200 pt-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {initials}
          </span>
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium text-slate-900">
              {user.firstName} {user.surname}
            </p>
            <p className="text-xs text-slate-500">{user.role}</p>
          </div>
        </div>
        <button onClick={logout} className="mt-2 self-start text-xs text-slate-500 underline hover:text-brand-700">
          Log out
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="rounded-md border border-slate-300 p-1.5 text-slate-700 md:hidden"
          >
            {mobileMenuOpen ? (
              <X size={20} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
          <div className="min-w-0 flex-1 overflow-x-auto">
            {showPersonalWidgets && <GlobalTimerBar />}
          </div>
          {showPersonalWidgets && <NotificationBell />}
          <button onClick={logout} className="shrink-0 text-xs text-slate-500 underline md:hidden">
            Log out
          </button>
        </header>
        {mobileMenuOpen && (
          <nav className="flex flex-col gap-1 border-b border-slate-200 bg-white p-3 md:hidden">
            {links.map(navLink)}
          </nav>
        )}
        {/* TRIAL - was flat white; a barely-there corner tint instead of the
            hero-level treatment on the auth pages, since this is what people
            look at for 8 hours a day, not once a session. Revert by dropping
            this className back to "flex-1 overflow-y-auto p-4 md:p-6". */}
        <main className="app-main-bg flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
