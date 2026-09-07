'use client';

import { useQuery } from '@tanstack/react-query';
import { TaskPriority, TaskStatus } from '@atms/shared';
import { api } from './api-client';

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  estimatedMinutes: number | null;
  assigneeId: string | null;
  createdById: string;
  assignee?: { id: string; firstName: string; surname: string } | null;
}

export function useMyTasks(status?: string, priority?: string) {
  return useQuery({
    queryKey: ['tasks', 'mine', status, priority],
    queryFn: () => api.get<TaskRow[]>('/tasks', { status, priority }),
  });
}

export function useAllTasks(filters: { status?: string; priority?: string; assigneeId?: string } = {}) {
  return useQuery({
    queryKey: ['tasks', 'all', filters],
    queryFn: () => api.get<TaskRow[]>('/tasks', { ...filters, scope: 'all' }),
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.get<TaskRow & { actualMinutes: number }>(`/tasks/${id}`),
    enabled: Boolean(id),
  });
}
