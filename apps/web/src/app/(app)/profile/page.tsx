'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateOwnProfileInput, updateOwnProfileSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { Card, CardTitle } from '@/components/ui/card';
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

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Profile</h1>
      <Card>
        <CardTitle>Account</CardTitle>
        <dl className="mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-900">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd className="text-slate-900">{user.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Department</dt>
            <dd className="text-slate-900">{user.department?.name ?? '—'}</dd>
          </div>
        </dl>
        <form
          onSubmit={handleSubmit((values) => {
            setError(null);
            update.mutate(values);
          })}
          className="space-y-3"
        >
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {success && <p className="rounded-md bg-green-50 p-2 text-sm text-green-700">Profile updated.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={errors.firstName?.message}>
              <Input {...register('firstName')} />
            </Field>
            <Field label="Surname" error={errors.surname?.message}>
              <Input {...register('surname')} />
            </Field>
          </div>
          <Field label="Phone number" error={errors.phoneNumber?.message}>
            <Input {...register('phoneNumber')} />
          </Field>
          <Button type="submit" loading={isSubmitting}>
            Save
          </Button>
        </form>
      </Card>
    </div>
  );
}
