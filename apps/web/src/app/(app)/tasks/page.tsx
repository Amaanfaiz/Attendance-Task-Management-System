'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListPlus, Check, Save } from 'lucide-react';
import {
  CreateTaskInput,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
  UserRole,
  UserStatus,
  createTaskSchema,
  updateTaskSchema,
} from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useMyTasks, useTask } from '@/lib/use-tasks';
import { useCurrentUser } from '@/lib/use-current-user';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';

const priorityColor: Record<TaskPriority, 'slate' | 'amber' | 'red' | 'blue'> = {
  [TaskPriority.LOW]: 'slate',
  [TaskPriority.MEDIUM]: 'blue',
  [TaskPriority.HIGH]: 'amber',
  [TaskPriority.CRITICAL]: 'red',
};

interface AssigneeOption {
  id: string;
  firstName: string;
  surname: string;
}

// Extracted from the old standalone /tasks/[id] route, which stays in place -
// notifications and Task Time History still deep-link to it directly. Same
// useTask/PATCH logic, same isAdmin gate on the edit form (an employee viewing
// their own task never sees it; an admin viewing their own assigned task does) -
// just reachable from the list without leaving the page too.
function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: task, isLoading } = useTask(taskId);
  const { data: currentUser } = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isAdmin = currentUser?.role === UserRole.ADMINISTRATOR;

  const { data: users } = useQuery({
    queryKey: ['users', 'admin', 'active-for-assign'],
    queryFn: () => api.get<AssigneeOption[]>('/users', { status: UserStatus.ACTIVE }),
    enabled: isAdmin,
  });

  const updateStatus = useMutation({
    mutationFn: (status: TaskStatus) => api.patch(`/tasks/${taskId}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
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
    mutationFn: (values: UpdateTaskInput) => api.patch(`/tasks/${taskId}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save changes'),
  });

  const variance = task && task.estimatedMinutes != null ? task.actualMinutes - task.estimatedMinutes : null;

  return (
    <Drawer open onClose={onClose} title={task?.title ?? 'Task detail'} subtitle={task ? task.priority : undefined}>
      {isLoading || !task ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {task.description && <p className="text-sm text-slate-600">{task.description}</p>}

          <div>
            <label className="mr-2 text-sm font-medium text-slate-700">Status</label>
            <Select
              uiSize="sm"
              className="w-auto"
              value={task.status}
              onChange={(e) => updateStatus.mutate(e.target.value as TaskStatus)}
            >
              {Object.values(TaskStatus).map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
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

          {isAdmin && (
            <div className="border-t border-slate-200 pt-5">
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
                    <Select {...register('priority')}>
                      {Object.values(TaskPriority).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Assignee" error={errors.assigneeId?.message}>
                    <Select {...register('assigneeId')}>
                      <option value="">Unassigned</option>
                      {(users ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.surname}
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
                <Button icon={<Save size={16} aria-hidden="true" />} type="submit" loading={isSubmitting}>
                  Save changes
                </Button>
              </form>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export default function TasksPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
              <button
                onClick={() => setSelectedTaskId(task.id)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {task.status.replace('_', ' ')}
                    {task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString()}` : ''}
                    {` · ${formatMinutes(task.actualMinutes)} logged`}
                  </p>
                </div>
                <Badge color={priorityColor[task.priority]}>{task.priority}</Badge>
              </button>
            </li>
          ))}
          {tasks && tasks.length === 0 && <li className="py-3 text-sm text-slate-500">No tasks yet.</li>}
        </ul>
      </Card>
      {selectedTaskId && <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />}
    </div>
  );
}
