'use client';

import { useState } from 'react';
import { UseFormRegisterReturn, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Building2, CheckCircle, Mail, Plus, Save, Settings2 } from 'lucide-react';
import { UpdateAppSettingsInput, updateAppSettingsSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useCreateDepartment, useDepartments } from '@/lib/use-departments';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

// No admin screen ever exposed POST /departments (audited live: departments could
// only ever be picked from a dropdown on Users/Live, never created), so every
// department those dropdowns list had to be seeded directly in the database.
function DepartmentsCard() {
  const { data: departments, isLoading } = useDepartments();
  const createDepartment = useCreateDepartment();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    createDepartment.mutate(name.trim(), {
      onSuccess: () => setName(''),
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create department'),
    });
  };

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Building2 size={16} className="text-slate-400" aria-hidden="true" />
        <CardTitle>Departments</CardTitle>
      </div>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {departments && departments.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {departments.map((d) => (
            <li key={d.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {d.name}
            </li>
          ))}
        </ul>
      )}
      {departments && departments.length === 0 && (
        <p className="mb-3 text-sm text-slate-500">No departments yet.</p>
      )}
      {error && <p className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex items-end gap-2">
        <Field label="New department name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering" />
        </Field>
        <Button
          icon={<Plus size={16} aria-hidden="true" />}
          type="button"
          variant="secondary"
          disabled={name.trim().length === 0}
          loading={createDepartment.isPending}
          onClick={submit}
        >
          Add
        </Button>
      </div>
    </Card>
  );
}

// Presentation only - a real checkbox under the hood (keyboard/tab/space all
// work natively), styled as a switch since a settings screen full of plain
// checkboxes reads as a form, not a set of on/off controls.
function ToggleField({
  label,
  description,
  registration,
}: {
  label: string;
  description?: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    // The whole row is the label, not just the 44x24 switch - on a touch
    // screen, requiring a tap to land on exactly the switch (while the
    // adjacent text describing what it does isn't clickable at all) is a
    // real usability gap, not just a visual one.
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input type="checkbox" className="peer sr-only" aria-label={label} {...registration} />
        <span
          className="absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 peer-focus-visible:ring-offset-2"
          aria-hidden="true"
        />
        <span
          className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

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
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>

      <DepartmentsCard />

      <form
        onSubmit={handleSubmit((v) => {
          setError(null);
          save.mutate(v);
        })}
        className="space-y-6"
      >
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {saved && (
          <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle size={16} className="shrink-0" aria-hidden="true" />
            <span>Settings saved.</span>
          </div>
        )}

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Settings2 size={16} className="text-slate-400" aria-hidden="true" />
            <CardTitle>General</CardTitle>
          </div>
          <div className="space-y-3 divide-y divide-slate-100">
            <ToggleField
              label="Require administrator approval for new registrations"
              registration={register('requireRegistrationApproval')}
            />
            <div className="pt-3">
              <ToggleField
                label="Employees can create their own tasks"
                registration={register('employeesCanCreateTasks')}
              />
            </div>
            <div className="pt-3">
              <Field label="Session inactivity timeout (minutes)" error={errors.sessionInactivityTimeoutMinutes?.message}>
                <Input type="number" {...register('sessionInactivityTimeoutMinutes', { valueAsNumber: true })} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-1 flex items-center gap-2">
            <Bell size={16} className="text-slate-400" aria-hidden="true" />
            <CardTitle>Reminders</CardTitle>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            A background check runs every few minutes and creates a notification whenever one of these rules is met.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div className="mb-3 flex items-center gap-2">
            <Mail size={16} className="text-slate-400" aria-hidden="true" />
            <CardTitle>Email notifications</CardTitle>
          </div>
          <ToggleField
            label="Also send notifications by email (in addition to in-app)"
            description="Requires an email provider to be configured on the server. If it isn't, this toggle has no effect and only in-app notifications are shown."
            registration={register('notificationsEmailEnabled')}
          />
        </Card>

        <Button icon={<Save size={16} aria-hidden="true" />} type="submit" loading={isSubmitting}>
          Save settings
        </Button>
      </form>
    </div>
  );
}
