'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface TimelineEvent {
  type: 'ATTENDANCE' | 'BREAK' | 'TASK';
  label: string;
  start: string;
  end: string | null;
}

export interface DailySummary {
  date: string;
  netWorkingMinutes: number;
  taskMinutes: number;
  unallocatedMinutes: number;
  hasDataQualityException: boolean;
  timeline: TimelineEvent[];
  sessionCount: number;
}

export function useReconciliation(date: string) {
  return useQuery({
    queryKey: ['reconciliation', 'me', date],
    queryFn: () => api.get<DailySummary>('/reconciliation/me', { date }),
    refetchInterval: 30_000,
  });
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h ${m}m`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
