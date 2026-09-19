'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, Phone, Save, User } from 'lucide-react';
import { UpdateOwnProfileInput, updateOwnProfileSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export default function ProfilePage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateOwnProfileInput>({ resolver: zodResolver(updateOwnProfileSchema) });

  useEffect(() => {
    if (user) reset({ firstName: user.firstName, surname: user.surname, phoneNumber: user.phoneNumber });
  }, [user, reset]);

  const update = useMutation({
    mutationFn: (values: UpdateOwnProfileInput) => api.patch('/users/me', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not update profile'),
  });

  if (!user) return null;

  const initials = `${user.firstName?.[0] ?? ''}${user.surname?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Profile</h1>

      <Card>
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">
              {user.firstName} {user.surname}
            </p>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
          </div>
          <Badge color="brand">{user.role}</Badge>
        </div>
        <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Department</dt>
            <dd className="text-slate-900">{user.department?.name ?? '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardTitle>Edit profile</CardTitle>
        <form
          onSubmit={handleSubmit((values) => {
            setError(null);
            update.mutate(values);
          })}
          className="space-y-3"
        >
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {success && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-2 text-sm text-green-700">
              <CheckCircle size={16} className="shrink-0" aria-hidden="true" />
              <span>Profile updated.</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={errors.firstName?.message}>
              <div className="relative">
                <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input className="pl-9" {...register('firstName')} />
              </div>
            </Field>
            <Field label="Surname" error={errors.surname?.message}>
              <div className="relative">
                <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input className="pl-9" {...register('surname')} />
              </div>
            </Field>
          </div>
          <Field label="Phone number" error={errors.phoneNumber?.message}>
            <div className="relative">
              <Phone size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input type="tel" className="pl-9" {...register('phoneNumber')} />
            </div>
          </Field>
          <p className="text-xs text-slate-500">
            Email, role and department are managed by an administrator.
          </p>
          <Button icon={<Save size={16} aria-hidden="true" />} type="submit" loading={isSubmitting}>
            Save
          </Button>
        </form>
      </Card>
    </div>
  );
}
