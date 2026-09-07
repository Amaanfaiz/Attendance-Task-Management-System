'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface TaskTimeEntryWithTask {
  id: string;
  taskId: string;
  startAt: string;
  endAt: string | null;
  status: 'RUNNING' | 'CLOSED';
  task: { id: string; title: string };
}

export interface AttendanceSession {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: 'ACTIVE' | 'ON_BREAK' | 'COMPLETED';
}

export interface AttendanceStateResponse {
  state: 'CLOCKED_OUT' | 'WORKING' | 'ON_BREAK';
  session: AttendanceSession | null;
  activeBreak: { id: string; startAt: string } | null;
  activeTimer: TaskTimeEntryWithTask | null;
}

// Polled every 15s — cheap, and keeps the global timer bar in sync across tabs/devices
// without any per-second server traffic (elapsed time itself ticks client-side).
export function useAttendanceState() {
  return useQuery({
    queryKey: ['attendance', 'state'],
    queryFn: () => api.get<AttendanceStateResponse>('/attendance/state'),
    refetchInterval: 15_000,
  });
}
