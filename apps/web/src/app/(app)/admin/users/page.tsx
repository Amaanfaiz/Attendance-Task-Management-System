'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Check, X, Users, UserCheck, Clock, UserX, Save, Upload, Download } from 'lucide-react';
import {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  ProfileChangeTargetType,
  UpdateEmergencyContactInput,
  UpdateEmployeeProfileInput,
  UserRole,
  UserStatus,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  updateEmergencyContactSchema,
  updateEmployeeProfileSchema,
} from '@atms/shared';
import { api, ApiError, exportUrl } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { useDepartments } from '@/lib/use-departments';
import { DocumentsSection } from '@/components/documents-section';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { KpiCard } from '@/components/ui/kpi-card';

interface UserRow {
  id: string;
  firstName: string;
  surname: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  department: { id: string; name: string } | null;
}

interface BulkImportResult {
  createdCount: number;
  created: { row: number; email: string }[];
  errors: { row: number; email?: string; message: string }[];
}

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
  dateOfBirth: string | null;
  jobTitle: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmployeeProfileDetail {
  address: string | null;
  mobilePhone: string | null;
  personalEmail: string | null;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null; // masked (e.g. "••••5678") - never the real value
}

interface EmergencyContactDetail {
  fullName: string;
  relationship: string;
  mobile: string | null;
  landline: string | null;
  email: string | null;
  address: string | null;
}

// EP-013: admin drawer's Personal Details section - applies immediately via
// POST /profile-changes/direct (the admin drawer is the "direct" path;
// self-service submissions on My Profile go through the request/approve
// queue instead). bankAccountNumber is handled separately from the rest of
// the form: the GET only ever returns the last-4-masked value, so pre-filling
// it into the input the way every other field is pre-filled would resave the
// mask itself as the "real" number the instant the admin submits without
// touching it. Left blank and only sent if the admin actually types a new one.
function PersonalDetailsSection({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newBankAccountNumber, setNewBankAccountNumber] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['users', userId, 'employee-profile'],
    queryFn: () => api.get<EmployeeProfileDetail | null>(`/users/${userId}/employee-profile`),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEmployeeProfileInput>({
    resolver: zodResolver(updateEmployeeProfileSchema),
    values: profile
      ? {
          address: profile.address ?? '',
          mobilePhone: profile.mobilePhone ?? '',
          personalEmail: profile.personalEmail ?? '',
          bankAccountName: profile.bankAccountName ?? '',
          bankSortCode: profile.bankSortCode ?? '',
        }
      : undefined,
  });

  const save = useMutation({
    mutationFn: (values: UpdateEmployeeProfileInput) =>
      api.post('/profile-changes/direct', {
        userId,
        targetType: ProfileChangeTargetType.EMPLOYEE_PROFILE,
        data: newBankAccountNumber.trim()
          ? { ...values, bankAccountNumber: newBankAccountNumber.trim() }
          : values,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'employee-profile'] });
      setNewBankAccountNumber('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save changes'),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setError(null);
        save.mutate(values);
      })}
      className="space-y-3"
    >
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">Saved.</p>}
      <Field label="Address" error={errors.address?.message}>
        <Input {...register('address')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mobile phone" error={errors.mobilePhone?.message}>
          <Input type="tel" {...register('mobilePhone')} />
        </Field>
        <Field label="Personal email" error={errors.personalEmail?.message}>
          <Input type="email" {...register('personalEmail')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bank account name" error={errors.bankAccountName?.message}>
          <Input {...register('bankAccountName')} />
        </Field>
        <Field label="Bank sort code" error={errors.bankSortCode?.message}>
          <Input {...register('bankSortCode')} />
        </Field>
      </div>
      <Field
        label={`Bank account number${profile?.bankAccountNumber ? ` (currently ${profile.bankAccountNumber})` : ''}`}
      >
        <Input
          placeholder="Leave blank to keep unchanged"
          value={newBankAccountNumber}
          onChange={(e) => setNewBankAccountNumber(e.target.value)}
        />
      </Field>
      <Button icon={<Save size={16} aria-hidden="true" />} type="submit" loading={isSubmitting || save.isPending}>
        Save personal details
      </Button>
    </form>
  );
}

function EmergencyContactSection({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: contact, isLoading } = useQuery({
    queryKey: ['users', userId, 'emergency-contact'],
    queryFn: () => api.get<EmergencyContactDetail | null>(`/users/${userId}/emergency-contact`),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateEmergencyContactInput>({
    resolver: zodResolver(updateEmergencyContactSchema),
    values: contact
      ? {
          fullName: contact.fullName,
          relationship: contact.relationship,
          mobile: contact.mobile ?? '',
          landline: contact.landline ?? '',
          email: contact.email ?? '',
          address: contact.address ?? '',
        }
      : undefined,
  });

  const save = useMutation({
    mutationFn: (values: UpdateEmergencyContactInput) =>
      api.post('/profile-changes/direct', {
        userId,
        targetType: ProfileChangeTargetType.EMERGENCY_CONTACT,
        data: values,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'emergency-contact'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save changes'),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setError(null);
        save.mutate(values);
      })}
      className="space-y-3"
    >
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">Saved.</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name" error={errors.fullName?.message}>
          <Input {...register('fullName')} />
        </Field>
        <Field label="Relationship" error={errors.relationship?.message}>
          <Input {...register('relationship')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mobile" error={errors.mobile?.message}>
          <Input type="tel" {...register('mobile')} />
        </Field>
        <Field label="Landline" error={errors.landline?.message}>
          <Input type="tel" {...register('landline')} />
        </Field>
      </div>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register('email')} />
      </Field>
      <Field label="Address" error={errors.address?.message}>
        <Input {...register('address')} />
      </Field>
      <Button icon={<Save size={16} aria-hidden="true" />} type="submit" loading={isSubmitting || save.isPending}>
        Save emergency contact
      </Button>
    </form>
  );
}

const statusColor: Record<UserStatus, 'slate' | 'green' | 'amber' | 'red'> = {
  [UserStatus.PENDING]: 'amber',
  [UserStatus.ACTIVE]: 'green',
  [UserStatus.SUSPENDED]: 'red',
  [UserStatus.INACTIVE]: 'slate',
  [UserStatus.REJECTED]: 'red',
};

// Extracted from the old standalone /admin/users/[id] route (removed - it had
// no other linkers). Same GET/PATCH /users/:id logic, now reachable without
// leaving the list.
function UserDetailDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { data: departments } = useDepartments();

  const { data: user, isLoading } = useQuery({
    queryKey: ['users', userId],
    queryFn: () => api.get<UserDetail>(`/users/${userId}`),
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
          dateOfBirth: user.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '',
          jobTitle: user.jobTitle ?? '',
        }
      : undefined,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['users', userId] });
    queryClient.invalidateQueries({ queryKey: ['users', 'admin'] });
  };

  const save = useMutation({
    mutationFn: (values: AdminUpdateUserInput) => api.patch(`/users/${userId}`, values),
    onSuccess: () => {
      invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save changes'),
  });

  const setRole = useMutation({
    mutationFn: (role: UserRole) => api.patch(`/users/${userId}`, { role }),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: (status: UserStatus) => api.patch(`/users/${userId}`, { status }),
    onSuccess: invalidate,
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={user ? `${user.firstName} ${user.surname}` : 'User detail'}
      subtitle={user?.email}
    >
      {isLoading || !user ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Status</span>
            <Badge color={statusColor[user.status]}>{user.status}</Badge>
          </div>

          <div>
            <CardTitle>Role &amp; status</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <Select value={user.role} onChange={(e) => setRole.mutate(e.target.value as UserRole)}>
                  {Object.values(UserRole).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={user.status} onChange={(e) => setStatus.mutate(e.target.value as UserStatus)}>
                  {Object.values(UserStatus).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Approved by {user.approvedById ? 'an administrator' : '—'}
              {user.approvedAt ? ` on ${new Date(user.approvedAt).toLocaleString()}` : ''}. Created{' '}
              {new Date(user.createdAt).toLocaleString()}.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <CardTitle>Profile</CardTitle>
            <form
              onSubmit={handleSubmit((values) => {
                setError(null);
                save.mutate(values);
              })}
              className="space-y-3"
            >
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
                  <Select {...register('departmentId')}>
                    <option value="">None</option>
                    {(departments ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Employee number" error={errors.employeeNumber?.message}>
                  <Input placeholder="Leave blank if unused" {...register('employeeNumber')} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of birth" error={errors.dateOfBirth?.message}>
                  <Input type="date" {...register('dateOfBirth')} />
                </Field>
                <Field label="Job title" error={errors.jobTitle?.message}>
                  <Input {...register('jobTitle')} />
                </Field>
              </div>
              <Button icon={<Save size={16} aria-hidden="true" />} type="submit" loading={isSubmitting}>
                Save changes
              </Button>
            </form>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <CardTitle>Personal details</CardTitle>
            <PersonalDetailsSection userId={userId} />
          </div>

          <div className="border-t border-slate-200 pt-5">
            <CardTitle>Emergency contact</CardTitle>
            <EmergencyContactSection userId={userId} />
          </div>

          <div className="border-t border-slate-200 pt-5">
            <CardTitle>Documents</CardTitle>
            <DocumentsSection userId={userId} canDelete />
          </div>
        </div>
      )}
    </Drawer>
  );
}

// AC-008-002-04: linked from the admin dashboard's "Active Users" KPI with
// ?status=... so the count is an actual drill-down, not just a static number.
function UserManagementPageInner() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [roleFilter, setRoleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { data: departments } = useDepartments();
  const { data: currentUser } = useCurrentUser();
  // RISK-015: Auditor can reach this page's data (GET /users is shared with the
  // Reports employee filter) but every write here still 403s server-side - hide
  // the edit affordances rather than show controls that look usable but aren't.
  const canEdit = currentUser?.role === UserRole.ADMINISTRATOR;

  // The KPI row below links back to this same page with ?status=... - a plain
  // useState(searchParams.get(...)) initializer only reads that once on mount,
  // so clicking a KPI while already here would change the URL without
  // changing the visible filter. Sync explicitly instead.
  useEffect(() => {
    setStatusFilter(searchParams.get('status') ?? '');
  }, [searchParams]);

  // AC not previously covered: GET /users already accepted role/departmentId/search,
  // but this page only ever sent status - found via API-vs-UI audit. Search is
  // applied client-side over the (already server-filtered-by-status/role/department)
  // rows, same pattern Live Attendance already uses for its own search box, rather
  // than refetching on every keystroke.
  const { data: users, isLoading } = useQuery({
    queryKey: ['users', 'admin', statusFilter, roleFilter, departmentFilter],
    queryFn: () =>
      api.get<UserRow[]>('/users', {
        status: statusFilter || undefined,
        role: roleFilter || undefined,
        departmentId: departmentFilter || undefined,
      }),
  });

  const filteredUsers = (users ?? []).filter((u) =>
    search ? `${u.firstName} ${u.surname} ${u.email}`.toLowerCase().includes(search.toLowerCase()) : true,
  );

  // Unfiltered, separate from the table's own (possibly status/role/department
  // filtered) query above, so these counts always reflect every user - reuses
  // the same GET /users endpoint, no new API.
  const { data: allUsersForKpis } = useQuery({
    queryKey: ['users', 'admin', 'kpis-unfiltered'],
    queryFn: () => api.get<UserRow[]>('/users', {}),
  });
  const kpiCounts = allUsersForKpis
    ? {
        total: allUsersForKpis.length,
        active: allUsersForKpis.filter((u) => u.status === UserStatus.ACTIVE).length,
        pending: allUsersForKpis.filter((u) => u.status === UserStatus.PENDING).length,
        suspended: allUsersForKpis.filter((u) => u.status === UserStatus.SUSPENDED).length,
      }
    : null;

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

  const bulkImport = useMutation({
    mutationFn: (file: File) => api.upload<BulkImportResult>('/users/bulk-import', file),
    onSuccess: (result) => {
      invalidate();
      setBulkResult(result);
      setBulkFile(null);
    },
    onError: (err) => setBulkError(err instanceof ApiError ? err.message : 'Could not import this file'),
  });

  const approve = useMutation({ mutationFn: (id: string) => api.post(`/users/${id}/approve`), onSuccess: invalidate });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post(`/users/${id}/reject`, { reason: reason || undefined }),
    onSuccess: (_data, { id }) => {
      invalidate();
      setRejectReason((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
  });
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">User Management</h1>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              icon={!showBulkImport && <Upload size={16} aria-hidden="true" />}
              variant="secondary"
              onClick={() => {
                setShowBulkImport((v) => !v);
                setShowCreate(false);
              }}
            >
              {showBulkImport ? 'Cancel' : 'Bulk Import'}
            </Button>
            <Button
              icon={!showCreate && <UserPlus size={16} aria-hidden="true" />}
              variant="secondary"
              onClick={() => {
                setShowCreate((v) => !v);
                setShowBulkImport(false);
              }}
            >
              {showCreate ? 'Cancel' : 'New User'}
            </Button>
          </div>
        )}
      </div>

      {showBulkImport && canEdit && (
        <Card>
          <CardTitle>Bulk Import Users</CardTitle>
          <p className="mb-3 text-sm text-slate-500">
            Upload a .xlsx spreadsheet with columns First Name, Surname, Email, Phone Number, Role, Department,
            Employee Number (Role and Department are optional).{' '}
            <a
              href={exportUrl('/users/bulk-import/template', {})}
              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
            >
              <Download size={14} aria-hidden="true" />
              Download a template
            </a>
            .
          </p>
          {bulkError && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{bulkError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".xlsx"
              aria-label="Spreadsheet to import"
              onChange={(e) => {
                setBulkError(null);
                setBulkResult(null);
                setBulkFile(e.target.files?.[0] ?? null);
              }}
              className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <Button
              icon={<Upload size={16} aria-hidden="true" />}
              disabled={!bulkFile}
              loading={bulkImport.isPending}
              onClick={() => {
                if (!bulkFile) return;
                setBulkError(null);
                setBulkResult(null);
                bulkImport.mutate(bulkFile);
              }}
            >
              Import
            </Button>
          </div>

          {bulkResult && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-emerald-700">
                {bulkResult.createdCount} user{bulkResult.createdCount === 1 ? '' : 's'} created. Each was emailed a
                link to create their password.
              </p>
              {bulkResult.errors.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1 text-sm font-medium text-amber-800">
                    {bulkResult.errors.length} row{bulkResult.errors.length === 1 ? '' : 's'} skipped:
                  </p>
                  <ul className="space-y-0.5 text-sm text-amber-800">
                    {bulkResult.errors.map((e) => (
                      <li key={e.row}>
                        Row {e.row}
                        {e.email ? ` (${e.email})` : ''}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {kpiCounts && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard icon={Users} label="Total Users" value={kpiCounts.total} />
          <KpiCard icon={UserCheck} label="Active" value={kpiCounts.active} accent="text-green-600" href="/admin/users?status=ACTIVE" />
          <KpiCard icon={Clock} label="Pending" value={kpiCounts.pending} accent="text-amber-600" href="/admin/users?status=PENDING" />
          <KpiCard icon={UserX} label="Suspended" value={kpiCounts.suspended} accent="text-red-600" href="/admin/users?status=SUSPENDED" />
        </div>
      )}

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
              <Field label="Date of birth" error={errors.dateOfBirth?.message}>
                <Input type="date" {...register('dateOfBirth')} />
              </Field>
              <Field label="Job title" error={errors.jobTitle?.message}>
                <Input {...register('jobTitle')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <Select {...register('role')}>
                  {Object.values(UserRole).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Department" error={errors.departmentId?.message}>
                <Select {...register('departmentId')}>
                  <option value="">None</option>
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Employee number" error={errors.employeeNumber?.message}>
              <Input placeholder="Leave blank if unused" {...register('employeeNumber')} />
            </Field>
            <p className="text-xs text-slate-500">
              A password-setup link will be emailed to the new user (falls back to the server log if email isn&rsquo;t
              configured or fails to send).
            </p>
            <Button icon={<Check size={16} aria-hidden="true" />} type="submit" loading={isSubmitting}>
              Create
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor="user-search" className="text-sm text-slate-600">
            Search:
          </label>
          <div className="w-full sm:w-56">
            <Input id="user-search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label htmlFor="status-filter" className="ml-2 text-sm text-slate-600">
            Status:
          </label>
          <Select
            id="status-filter"
            uiSize="sm"
            className="w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {Object.values(UserStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <label htmlFor="role-filter" className="ml-2 text-sm text-slate-600">
            Role:
          </label>
          <Select
            id="role-filter"
            uiSize="sm"
            className="w-auto"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All</option>
            {Object.values(UserRole).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <label htmlFor="department-filter" className="ml-2 text-sm text-slate-600">
            Department:
          </label>
          <Select
            id="department-filter"
            uiSize="sm"
            className="w-auto"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="">All</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Users table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2.5 pr-4">
                    {canEdit ? (
                      <button
                        onClick={() => setSelectedUserId(u.id)}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {u.firstName} {u.surname}
                      </button>
                    ) : (
                      <span className="font-medium text-slate-900">
                        {u.firstName} {u.surname}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">{u.email}</td>
                  <td className="py-2.5 pr-4">
                    {canEdit ? (
                      <Select
                        uiSize="xs"
                        className="w-auto"
                        aria-label={`Change role for ${u.firstName} ${u.surname}`}
                        value={u.role}
                        onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value as UserRole })}
                      >
                        {Object.values(UserRole).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      u.role
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">{u.department?.name ?? '—'}</td>
                  <td className="py-2.5 pr-4">
                    <Badge color={statusColor[u.status]} dot>{u.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    {!canEdit ? null : u.status === UserStatus.PENDING ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button icon={<Check size={16} aria-hidden="true" />} variant="secondary" onClick={() => approve.mutate(u.id)}>
                          Approve
                        </Button>
                        <div className="w-36">
                          <Input
                            placeholder="Reason (optional)"
                            aria-label={`Rejection reason for ${u.firstName} ${u.surname}`}
                            value={rejectReason[u.id] ?? ''}
                            onChange={(e) => setRejectReason((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          />
                        </div>
                        <Button
                          icon={<X size={16} aria-hidden="true" />}
                          variant="danger"
                          loading={reject.isPending}
                          onClick={() => reject.mutate({ id: u.id, reason: rejectReason[u.id] })}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Select
                        uiSize="xs"
                        className="w-auto"
                        aria-label={`Change status for ${u.firstName} ${u.surname}`}
                        value={u.status}
                        onChange={(e) => setStatus.mutate({ id: u.id, status: e.target.value as UserStatus })}
                      >
                        {Object.values(UserStatus).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                </tr>
              ))}
              {users && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    {users.length === 0 ? 'No users match these filters.' : 'No one matches this search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {selectedUserId && <UserDetailDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
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
