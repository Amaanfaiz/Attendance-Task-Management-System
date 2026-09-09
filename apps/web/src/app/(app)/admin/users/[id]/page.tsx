'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminUpdateUserInput, UserRole, UserStatus, adminUpdateUserSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useDepartments } from '@/lib/use-departments';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface UserDetail {
  id: string;
  firstName: string;
  surname: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  employeeNumber: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusColor: Record<UserStatus, 'slate' | 'green' | 'amber' | 'red'> = {
  [UserStatus.PENDING]: 'amber',
  [UserStatus.ACTIVE]: 'green',
  [UserStatus.SUSPENDED]: 'red',
  [UserStatus.INACTIVE]: 'slate',
  [UserStatus.REJECTED]: 'red',
};

// SCR-013 User Detail: the admin/users list only ever exposed role and status -
// there was no way to edit anyone's name, email, phone, department or employee
// number at all once created (found live: the backend already supported all of
// this via PATCH /users/:id, the UI just never called it for these fields).
export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { data: departments } = useDepartments();

  const { data: user, isLoading } = useQuery({
    queryKey: ['users', params.id],
    queryFn: () => api.get<UserDetail>(`/users/${params.id}`),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminUpdateUserInput>({
    resolver: zodResolver(adminUpdateUserSchema),
    values: user
      ? {
          firstName: user.firstName,
          surname: user.surname,
          email: user.email,
          phoneNumber: user.phoneNumber,
          departmentId: user.departmentId ?? '',
          employeeNumber: user.employeeNumber ?? '',
        }
      : undefined,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['users', params.id] });
    queryClient.invalidateQueries({ queryKey: ['users', 'admin'] });
  };

  const save = useMutation({
    mutationFn: (values: AdminUpdateUserInput) => api.patch(`/users/${params.id}`, values),
    onSuccess: () => {
      invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save changes'),
  });

  const setRole = useMutation({
    mutationFn: (role: UserRole) => api.patch(`/users/${params.id}`, { role }),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: (status: UserStatus) => api.patch(`/users/${params.id}`, { status }),
    onSuccess: invalidate,
  });

  if (isLoading || !user) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <button onClick={() => router.push('/admin/users')} className="text-sm text-slate-500 hover:underline">
        ← Back to User Management
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          {user.firstName} {user.surname}
        </h1>
        <Badge color={statusColor[user.status]}>{user.status}</Badge>
      </div>

      <Card>
        <CardTitle>Role &amp; status</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Role">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={user.role}
              onChange={(e) => setRole.mutate(e.target.value as UserRole)}
            >
              {Object.values(UserRole).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={user.status}
              onChange={(e) => setStatus.mutate(e.target.value as UserStatus)}
            >
              {Object.values(UserStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Approved by {user.approvedById ? 'an administrator' : '—'}
          {user.approvedAt ? ` on ${new Date(user.approvedAt).toLocaleString()}` : ''}. Created{' '}
          {new Date(user.createdAt).toLocaleString()}.
        </p>
      </Card>

      <Card>
        <CardTitle>Profile</CardTitle>
        <form
          onSubmit={handleSubmit((values) => {
            setError(null);
            save.mutate(values);
          })}
          className="mt-3 space-y-3"
        >
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {saved && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">Saved.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" error={errors.firstName?.message}>
              <Input {...register('firstName')} />
            </Field>
            <Field label="Surname" error={errors.surname?.message}>
              <Input {...register('surname')} />
            </Field>
          </div>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" {...register('email')} />
          </Field>
          <Field label="Phone number" error={errors.phoneNumber?.message}>
            <Input {...register('phoneNumber')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department" error={errors.departmentId?.message}>
              <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('departmentId')}>
                <option value="">None</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Employee number" error={errors.employeeNumber?.message}>
              <Input placeholder="Leave blank if unused" {...register('employeeNumber')} />
            </Field>
          </div>
          <Button type="submit" loading={isSubmitting}>
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  );
}
