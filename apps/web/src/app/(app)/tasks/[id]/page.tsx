'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskStatus } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useTask } from '@/lib/use-tasks';
import { formatMinutes } from '@/lib/use-reconciliation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: task, isLoading } = useTask(params.id);
  const [error, setError] = useState<string | null>(null);

  const updateStatus = useMutation({
    mutationFn: (status: TaskStatus) => api.patch(`/tasks/${params.id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not update task'),
  });

  if (isLoading || !task) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const variance = task.estimatedMinutes != null ? task.actualMinutes - task.estimatedMinutes : null;

  return (
    <div className="space-y-6">
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
    </div>
  );
}
