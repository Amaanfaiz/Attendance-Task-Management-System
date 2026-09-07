'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface Department {
  id: string;
  name: string;
}

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
  });
}
