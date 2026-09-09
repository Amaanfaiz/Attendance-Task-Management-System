'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UpdateAppSettingsInput, updateAppSettingsSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

// EP-011: thresholds/cooldowns the reminder-scanning job reads (AC-011-002-01,
// AC-011-003-01, AC-011-003-04, AC-011-004-01), plus the email-channel toggle
// (AC-011-001-01). All backed by the existing GET/PATCH /settings endpoint - the
// two threshold fields already existed here before EP-011 was built; this page
// just gives them (and the four new fields) somewhere to actually be edited.
export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<UpdateAppSettingsInput>('/settings'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAppSettingsInput>({
    resolver: zodResolver(updateAppSettingsSchema),
    values: settings,
  });

  const save = useMutation({
    mutationFn: (values: UpdateAppSettingsInput) => api.patch('/settings', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save settings'),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <form
        onSubmit={handleSubmit((v) => {
          setError(null);
          save.mutate(v);
        })}
        className="space-y-6"
      >
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {saved && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Settings saved.</p>}

        <Card>
          <CardTitle>General</CardTitle>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4" {...register('requireRegistrationApproval')} />
              Require administrator approval for new registrations
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4" {...register('employeesCanCreateTasks')} />
              Employees can create their own tasks
            </label>
            <Field label="Session inactivity timeout (minutes)" error={errors.sessionInactivityTimeoutMinutes?.message}>
              <Input type="number" {...register('sessionInactivityTimeoutMinutes', { valueAsNumber: true })} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Reminders</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            A background check runs every few minutes and creates a notification whenever one of these rules is met.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Missing clock-out threshold (minutes)" error={errors.missingClockOutThresholdMinutes?.message}>
              <Input type="number" {...register('missingClockOutThresholdMinutes', { valueAsNumber: true })} />
            </Field>
            <Field label="Long-running timer threshold (minutes)" error={errors.longRunningTimerThresholdMinutes?.message}>
              <Input type="number" {...register('longRunningTimerThresholdMinutes', { valueAsNumber: true })} />
            </Field>
            <Field label="Long-running timer reminder cooldown (minutes)" error={errors.longRunningTimerCooldownMinutes?.message}>
              <Input type="number" {...register('longRunningTimerCooldownMinutes', { valueAsNumber: true })} />
            </Field>
            <Field label="Unallocated time threshold (minutes)" error={errors.unallocatedTimeThresholdMinutes?.message}>
              <Input type="number" {...register('unallocatedTimeThresholdMinutes', { valueAsNumber: true })} />
            </Field>
            <Field label="Unallocated reminder cutoff hour (UTC, 0-23)" error={errors.unallocatedReminderCutoffHourUtc?.message}>
              <Input type="number" min={0} max={23} {...register('unallocatedReminderCutoffHourUtc', { valueAsNumber: true })} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardTitle>Email notifications</CardTitle>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4" {...register('notificationsEmailEnabled')} />
            Also send notifications by email (in addition to in-app)
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Requires an email provider to be configured on the server. If it isn&rsquo;t, this toggle has no effect and only in-app notifications are shown.
          </p>
        </Card>

        <Button type="submit" loading={isSubmitting}>
          Save settings
        </Button>
      </form>
    </div>
  );
}
