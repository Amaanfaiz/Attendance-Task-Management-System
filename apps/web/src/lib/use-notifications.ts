'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

export interface NotificationItem {
  id: string;
  type: 'TASK_ASSIGNED' | 'MISSING_CLOCK_OUT' | 'LONG_RUNNING_TIMER' | 'UNALLOCATED_TIME';
  title: string;
  body: string;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  unreadCount: number;
  items: NotificationItem[];
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationsResponse>('/notifications'),
    refetchInterval: 20_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// AC-011-001-03/AC-011-003-03/AC-011-004-03: where a notification click should land.
export function notificationHref(item: NotificationItem): string {
  if (item.type === 'TASK_ASSIGNED' && item.taskId) return `/tasks/${item.taskId}`;
  return '/my-day';
}
