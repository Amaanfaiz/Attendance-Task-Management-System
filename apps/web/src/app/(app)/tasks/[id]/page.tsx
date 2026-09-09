'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TaskPriority, TaskStatus, UserRole, UserStatus, UpdateTaskInput, updateTaskSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useTask } from '@/lib/use-tasks';
import { useCurrentUser } from '@/lib/use-current-user';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface UserOption {
  id: string;
  firstName: string;
  surname: string;
}

// SCR-008 Task Detail: only ever exposed a status dropdown, even though
// PATCH /tasks/:id already supported reassignment, priority, due date and
// estimate for admins (and already triggers a notification on reassignment -
// see notifyTaskAssigned in EP-011). AC-005-001-02/AC-005-003-01 need a real
// way to set these after creation, not just at creation time.
export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: task, isLoading } = useTask(params.id);
  const { data: currentUser } = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isAdmin = currentUser?.role === UserRole.ADMINISTRATOR;

  const { data: users } = useQuery({
    queryKey: ['users', 'admin', 'active-for-assign'],
    queryFn: () => api.get<UserOption[]>('/users', { status: UserStatus.ACTIVE }),
    enabled: isAdmin,
  });

  const updateStatus = useMutation({
    mutationFn: (status: TaskStatus) => api.patch(`/tasks/${params.id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not update task'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateTaskInput>({
    resolver: zodResolver(updateTaskSchema),
    values: task
      ? {
          title: task.title,
          description: task.description ?? '',
          priority: task.priority,
          assigneeId: task.assigneeId ?? '',
          estimatedMinutes: task.estimatedMinutes ?? undefined,
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
        }
      : undefined,
  });

  const save = useMutation({
    mutationFn: (values: UpdateTaskInput) => api.patch(`/tasks/${params.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save changes'),
  });

  if (isLoading || !task) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const variance = task.estimatedMinutes != null ? task.actualMinutes - task.estimatedMinutes : null;

  return (
    <div className="max-w-2xl space-y-6">
      <button onClick={() => router.back()} className="text-sm text-slate-500 hover:underline">
        ← Back
      </button>
      <Card>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
            {task.description && <p className="mt-1 text-sm text-slate-600">{task.description}</p>}
          </div>
          <Badge color="blue">{task.priority}</Badge>
        </div>
        {error && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mb-4">
          <label className="mr-2 text-sm font-medium text-slate-700">Status</label>
          <select
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={task.status}
            onChange={(e) => updateStatus.mutate(e.target.value as TaskStatus)}
          >
            {Object.values(TaskStatus).map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-slate-500">Actual time</p>
            <p className="text-lg font-semibold text-slate-900">{formatMinutes(task.actualMinutes)}</p>
          </div>
          {task.estimatedMinutes != null && (
            <>
              <div>
                <p className="text-xs uppercase text-slate-500">Estimated</p>
                <p className="text-lg font-semibold text-slate-900">{formatMinutes(task.estimatedMinutes)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Variance</p>
                <p className={'text-lg font-semibold ' + (variance! > 0 ? 'text-red-600' : 'text-green-600')}>
                  {variance! > 0 ? '+' : ''}
                  {formatMinutes(variance!)}
                </p>
              </div>
            </>
          )}
          {task.dueDate && (
            <div>
              <p className="text-xs uppercase text-slate-500">Due</p>
              <p className="text-lg font-semibold text-slate-900">{new Date(task.dueDate).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <CardTitle>Edit task</CardTitle>
          <form
            onSubmit={handleSubmit((values) => {
              setError(null);
              save.mutate(values);
            })}
            className="space-y-3"
          >
            {saved && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">Saved.</p>}
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
              <Field label="Assignee" error={errors.assigneeId?.message}>
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
            <Field label="Due date" error={errors.dueDate?.message}>
              <Input type="date" {...register('dueDate')} />
            </Field>
            <Button type="submit" loading={isSubmitting}>
              Save changes
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
