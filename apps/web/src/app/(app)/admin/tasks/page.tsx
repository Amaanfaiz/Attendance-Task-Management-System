'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListPlus, Check, Save } from 'lucide-react';
import {
  CreateTaskInput,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
  UserStatus,
  createTaskSchema,
  updateTaskSchema,
} from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useAllTasks, useTask } from '@/lib/use-tasks';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';

interface UserOption {
  id: string;
  firstName: string;
  surname: string;
  status: UserStatus;
}

// Extracted from the previous /tasks/[id] route (which stays in place -
// employees still reach it directly from My Tasks for status-only edits).
// Same data (useTask), same PATCH /tasks/:id mutation, no backend change -
// just re-packaged as a slide-over so an admin doesn't leave the list to
// see or edit a task, matching the approved redesign's drawer pattern.
function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: task, isLoading } = useTask(taskId);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: users } = useQuery({
    queryKey: ['users', 'admin', 'active-for-assign'],
    queryFn: () => api.get<UserOption[]>('/users', { status: UserStatus.ACTIVE }),
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
        </div>
      )}
    </Drawer>
  );
}

const priorityColor: Record<TaskPriority, 'slate' | 'blue' | 'amber' | 'red'> = {
  [TaskPriority.LOW]: 'slate',
  [TaskPriority.MEDIUM]: 'blue',
  [TaskPriority.HIGH]: 'amber',
  [TaskPriority.CRITICAL]: 'red',
};

const statusColor: Record<TaskStatus, 'slate' | 'blue' | 'amber' | 'green' | 'red'> = {
  [TaskStatus.TO_DO]: 'slate',
  [TaskStatus.IN_PROGRESS]: 'blue',
  [TaskStatus.PAUSED]: 'amber',
  [TaskStatus.COMPLETED]: 'green',
  [TaskStatus.CANCELLED]: 'red',
};

// AC-008-004-03 / AC-008-002-04: the admin dashboard's KPI tiles link here with
// ?status=... or ?overdue=1 so a count on the dashboard actually drills down to
// the matching filtered list, instead of just being a number nobody can click.
function AdminTasksPageInner() {
  const searchParams = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const overdueOnly = searchParams.get('overdue') === '1';
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // AC-005-004-03: the backend already accepted a priority filter here too,
  // but this page only ever exposed the status one. The backend also already
  // accepted assigneeId (found via API-vs-UI audit) with no control for it either.
  const { data: allTasks, isLoading } = useAllTasks({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
    ...(assigneeFilter ? { assigneeId: assigneeFilter } : {}),
  });
  const tasks = overdueOnly
    ? (allTasks ?? []).filter(
        (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED' && t.status !== 'CANCELLED',
      )
    : allTasks;
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
        <Button
          icon={!showCreate && <ListPlus size={16} aria-hidden="true" />}
          variant="secondary"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? 'Cancel' : 'New Task'}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardTitle>Create Task</CardTitle>
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
            <Button icon={<Check size={16} aria-hidden="true" />} type="submit" loading={isSubmitting}>
              Create Task
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor="task-status-filter" className="text-sm text-slate-600">
            Filter by status:
          </label>
          <Select
            id="task-status-filter"
            uiSize="sm"
            className="w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {Object.values(TaskStatus).map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </Select>
          <label htmlFor="task-priority-filter" className="text-sm text-slate-600">
            Filter by priority:
          </label>
          <Select
            id="task-priority-filter"
            uiSize="sm"
            className="w-auto"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">All</option>
            {Object.values(TaskPriority).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <label htmlFor="task-assignee-filter" className="text-sm text-slate-600">
            Filter by assignee:
          </label>
          <Select
            id="task-assignee-filter"
            uiSize="sm"
            className="w-auto"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="">All</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.surname}
              </option>
            ))}
          </Select>
          {overdueOnly && (
            <Badge color="red">Overdue only (from dashboard)</Badge>
          )}
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tasks table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Assignee</th>
                <th className="py-2 pr-4">Priority</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Due</th>
                <th className="py-2 pr-4 text-right">Actual time</th>
              </tr>
            </thead>
            <tbody>
              {(tasks ?? []).map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="py-2.5 pr-4 font-medium text-slate-900 hover:text-brand-700">{t.title}</td>
                  <td className="py-2.5 pr-4 text-slate-600">
                    {t.assignee ? `${t.assignee.firstName} ${t.assignee.surname}` : '—'}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge color={priorityColor[t.priority]}>{t.priority}</Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge color={statusColor[t.status]} dot>{t.status.replace('_', ' ')}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-900">{formatMinutes(t.actualMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {selectedTaskId && <TaskDetailDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />}
    </div>
  );
}

export default function AdminTasksPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <AdminTasksPageInner />
    </Suspense>
  );
}
