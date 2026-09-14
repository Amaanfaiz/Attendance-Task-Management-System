'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListPlus, Check } from 'lucide-react';
import { CreateTaskInput, TaskPriority, TaskStatus, createTaskSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useMyTasks } from '@/lib/use-tasks';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const priorityColor: Record<TaskPriority, 'slate' | 'amber' | 'red' | 'blue'> = {
  [TaskPriority.LOW]: 'slate',
  [TaskPriority.MEDIUM]: 'blue',
  [TaskPriority.HIGH]: 'amber',
  [TaskPriority.CRITICAL]: 'red',
};

export default function TasksPage() {
  const [showCreate, setShowCreate] = useState(false);
  // AC-005-004-03/AC-005-008-02: the backend already accepted status/priority
  // filters on GET /tasks, but this page never exposed either one.
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const { data: tasks, isLoading } = useMyTasks(statusFilter || undefined, priorityFilter || undefined);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // AC-005-002-01: the org setting already blocked creation server-side (403),
  // but the button/form here were shown unconditionally regardless of it,
  // letting an employee fill out a form that could only ever fail.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ employeesCanCreateTasks: boolean }>('/settings'),
  });
  const canCreate = settings?.employeesCanCreateTasks ?? false;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { priority: TaskPriority.MEDIUM },
  });

  const create = useMutation({
    mutationFn: (values: CreateTaskInput) => api.post('/tasks', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      reset();
      setShowCreate(false);
    },
  });

  const onSubmit = async (values: CreateTaskInput) => {
    setError(null);
    try {
      await create.mutateAsync(values);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create task');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">My Tasks</h1>
        {canCreate && (
          <Button
            icon={!showCreate && <ListPlus size={16} aria-hidden="true" />}
            variant="secondary"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? 'Cancel' : 'New Task'}
          </Button>
        )}
      </div>

      {!canCreate && settings && (
        <p className="text-sm text-slate-500">
          Your organisation currently only allows administrators to create tasks.
        </p>
      )}

      {showCreate && canCreate && (
        <Card>
          <CardTitle>Create Task</CardTitle>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <Field label="Title" error={errors.title?.message}>
              <Input {...register('title')} />
            </Field>
            <Field label="Description" error={errors.description?.message}>
              <Input {...register('description')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority" error={errors.priority?.message}>
                <Select {...register('priority')}>
                  {Object.values(TaskPriority).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Estimated minutes" error={errors.estimatedMinutes?.message}>
                <Input type="number" {...register('estimatedMinutes', { valueAsNumber: true })} />
              </Field>
            </div>
            <Field label="Due date" error={errors.dueDate?.message}>
              <Input type="date" {...register('dueDate')} />
            </Field>
            <Button icon={<Check size={16} aria-hidden="true" />} type="submit" loading={isSubmitting}>
              Create Task
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            Status:
            <Select uiSize="sm" className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Active (default)</option>
              {Object.values(TaskStatus).map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            Priority:
            <Select uiSize="sm" className="w-auto" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">All</option>
              {Object.values(TaskPriority).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <ul className="divide-y divide-slate-100">
          {(tasks ?? []).map((task) => (
            <li key={task.id} className="py-3">
              <Link href={`/tasks/${task.id}`} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {task.status.replace('_', ' ')}
                    {task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString()}` : ''}
                    {` · ${formatMinutes(task.actualMinutes)} logged`}
                  </p>
                </div>
                <Badge color={priorityColor[task.priority]}>{task.priority}</Badge>
              </Link>
            </li>
          ))}
          {tasks && tasks.length === 0 && <li className="py-3 text-sm text-slate-500">No tasks yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
