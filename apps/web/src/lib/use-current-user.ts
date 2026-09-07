'use client';

import { useQuery } from '@tanstack/react-query';
import { UserRole, UserStatus } from '@atms/shared';
import { api } from './api-client';

export interface CurrentUserProfile {
  id: string;
  firstName: string;
  surname: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  employeeNumber: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => api.get<CurrentUserProfile>('/users/me'),
    retry: false,
  });
}
