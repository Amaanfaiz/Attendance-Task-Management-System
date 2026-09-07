'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreateTaskInput, TaskPriority, createTaskSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useMyTasks } from '@/lib/use-tasks';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const priorityColor: Record<TaskPriority, 'slate' | 'amber' | 'red' | 'blue'> = {
  [TaskPriority.LOW]: 'slate',
  [TaskPriority.MEDIUM]: 'blue',
  [TaskPriority.HIGH]: 'amber',
  [TaskPriority.CRITICAL]: 'red',
};

export default function TasksPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: tasks, isLoading } = useMyTasks();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
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
        <Button variant="secondary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : 'New Task'}
        </Button>
      </div>

      {showCreate && (
        <Card>
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
                <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('priority')}>
                  {Object.values(TaskPriority).map((p) => (
                    <option key={p} value={p}>
                      {p}
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
