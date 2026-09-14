'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Department>('/departments', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  });
}
