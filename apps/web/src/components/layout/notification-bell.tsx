'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  notificationHref,
  useMarkNotificationRead,
  useNotifications,
  type NotificationItem,
} from '@/lib/use-notifications';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  function handleSelect(item: NotificationItem) {
    if (!item.readAt) markRead.mutate(item.id);
    setOpen(false);
    router.push(notificationHref(item));
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-md border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-100"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 8a5 5 0 0 1 10 0c0 3.5 1.2 4.8 1.5 5.2.3.4 0 1-.6 1H4.1c-.6 0-.9-.6-.6-1C3.8 12.8 5 11.5 5 8Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 16.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notifications
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleSelect(item)}
                  className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    {!item.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />}
                    <span className="text-sm font-medium text-slate-900">{item.title}</span>
                  </span>
                  <span className="text-xs text-slate-500">{item.body}</span>
                  <span className="text-[11px] text-slate-400">{timeAgo(item.createdAt)}</span>
                </button>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
