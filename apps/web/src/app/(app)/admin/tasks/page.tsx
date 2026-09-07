'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateTaskInput, TaskPriority, TaskStatus, UserStatus, createTaskSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useAllTasks } from '@/lib/use-tasks';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface UserOption {
  id: string;
  firstName: string;
  surname: string;
  status: UserStatus;
}

export default function AdminTasksPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useAllTasks(statusFilter ? { status: statusFilter } : {});
  const { data: users } = useQuery({
    queryKey: ['users', 'admin', 'active-for-assign'],
    queryFn: () => api.get<UserOption[]>('/users', { status: UserStatus.ACTIVE }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTaskInput>({ resolver: zodResolver(createTaskSchema), defaultValues: { priority: TaskPriority.MEDIUM } });

  const create = useMutation({
    mutationFn: (values: CreateTaskInput) => api.post('/tasks', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      reset();
      setShowCreate(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create task'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Task Management</h1>
        <Button variant="secondary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : 'New Task'}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <form onSubmit={handleSubmit((v) => { setError(null); create.mutate(v); })} className="space-y-3">
            {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <Field label="Title" error={errors.title?.message}>
              <Input {...register('title')} />
            </Field>
            <Field label="Description" error={errors.description?.message}>
              <Input {...register('description')} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Priority">
                <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('priority')}>
                  {Object.values(TaskPriority).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assignee">
                <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('assigneeId')}>
                  <option value="">Unassigned</option>
                  {(users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.surname}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estimated minutes" error={errors.estimatedMinutes?.message}>
                <Input type="number" {...register('estimatedMinutes', { valueAsNumber: true })} />
              </Field>
            </div>
            <Button type="submit" loading={isSubmitting}>
              Create Task
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <label className="text-sm text-slate-600">Filter by status:</label>
          <select
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {Object.values(TaskStatus).map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Assignee</th>
                <th className="py-2 pr-4">Priority</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Due</th>
              </tr>
            </thead>
            <tbody>
              {(tasks ?? []).map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    <Link href={`/tasks/${t.id}`} className="text-slate-900 hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    {t.assignee ? `${t.assignee.firstName} ${t.assignee.surname}` : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge color="blue">{t.priority}</Badge>
                  </td>
                  <td className="py-2 pr-4">{t.status.replace('_', ' ')}</td>
                  <td className="py-2 pr-4">{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
