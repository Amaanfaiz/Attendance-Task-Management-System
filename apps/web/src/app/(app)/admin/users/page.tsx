'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminCreateUserInput, UserRole, UserStatus, adminCreateUserSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { useDepartments } from '@/lib/use-departments';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface UserRow {
  id: string;
  firstName: string;
  surname: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  department: { id: string; name: string } | null;
}

const statusColor: Record<UserStatus, 'slate' | 'green' | 'amber' | 'red'> = {
  [UserStatus.PENDING]: 'amber',
  [UserStatus.ACTIVE]: 'green',
  [UserStatus.SUSPENDED]: 'red',
  [UserStatus.INACTIVE]: 'slate',
  [UserStatus.REJECTED]: 'red',
};

// AC-008-002-04: linked from the admin dashboard's "Active Users" KPI with
// ?status=... so the count is an actual drill-down, not just a static number.
function UserManagementPageInner() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: departments } = useDepartments();
  const { data: currentUser } = useCurrentUser();
  // RISK-015: Auditor can reach this page's data (GET /users is shared with the
  // Reports employee filter) but every write here still 403s server-side - hide
  // the edit affordances rather than show controls that look usable but aren't.
  const canEdit = currentUser?.role === UserRole.ADMINISTRATOR;

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', 'admin', statusFilter],
    queryFn: () => api.get<UserRow[]>('/users', statusFilter ? { status: statusFilter } : undefined),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdminCreateUserInput>({
    resolver: zodResolver(adminCreateUserSchema),
    defaultValues: { role: UserRole.EMPLOYEE },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users', 'admin'] });

  const createUser = useMutation({
    mutationFn: (values: AdminCreateUserInput) => api.post('/users', values),
    onSuccess: () => {
      invalidate();
      reset();
      setShowCreate(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create user'),
  });

  const approve = useMutation({ mutationFn: (id: string) => api.post(`/users/${id}/approve`), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: (id: string) => api.post(`/users/${id}/reject`, {}), onSuccess: invalidate });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) => api.patch(`/users/${id}`, { status }),
    onSuccess: invalidate,
  });
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => api.patch(`/users/${id}`, { role }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">User Management</h1>
        {canEdit && (
          <Button variant="secondary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : 'New User'}
          </Button>
        )}
      </div>

      {showCreate && canEdit && (
        <Card>
          <CardTitle>Create User</CardTitle>
          <form
            onSubmit={handleSubmit((values) => {
              setError(null);
              createUser.mutate(values);
            })}
            className="space-y-3"
          >
            {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
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
              <Field label="Role">
                <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('role')}>
                  {Object.values(UserRole).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
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
            </div>
            <Field label="Employee number" error={errors.employeeNumber?.message}>
              <Input placeholder="Leave blank if unused" {...register('employeeNumber')} />
            </Field>
            <p className="text-xs text-slate-500">
              A password-setup link will be emailed to the new user (falls back to the server log if email isn&rsquo;t
              configured or fails to send).
            </p>
            <Button type="submit" loading={isSubmitting}>
              Create
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm text-slate-600">
            Filter by status:
          </label>
          <select
            id="status-filter"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {Object.values(UserStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Users table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    {canEdit ? (
                      <Link href={`/admin/users/${u.id}`} className="text-slate-900 hover:underline">
                        {u.firstName} {u.surname}
                      </Link>
                    ) : (
                      <span className="text-slate-900">
                        {u.firstName} {u.surname}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">
                    {canEdit ? (
                      <select
                        className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                        aria-label={`Change role for ${u.firstName} ${u.surname}`}
                        value={u.role}
                        onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as UserRole })}
                      >
                        {Object.values(UserRole).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      u.role
                    )}
                  </td>
                  <td className="py-2 pr-4">{u.department?.name ?? '—'}</td>
                  <td className="py-2 pr-4">
                    <Badge color={statusColor[u.status]}>{u.status}</Badge>
                  </td>
                  <td className="py-2 pr-4">
                    {!canEdit ? null : u.status === UserStatus.PENDING ? (
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => approve.mutate(u.id)}>
                          Approve
                        </Button>
                        <Button variant="danger" onClick={() => reject.mutate(u.id)}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <select
                        className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                        aria-label={`Change status for ${u.firstName} ${u.surname}`}
                        value={u.status}
                        onChange={(e) => setStatus.mutate({ id: u.id, status: e.target.value as UserStatus })}
                      >
                        {Object.values(UserStatus).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function UserManagementPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <UserManagementPageInner />
    </Suspense>
  );
}
