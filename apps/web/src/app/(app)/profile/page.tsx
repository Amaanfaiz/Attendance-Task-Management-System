'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, Clock, Phone, Save, User } from 'lucide-react';
import {
  ProfileChangeTargetType,
  UpdateEmergencyContactInput,
  UpdateEmployeeProfileInput,
  UpdateOwnProfileInput,
  updateEmergencyContactSchema,
  updateEmployeeProfileSchema,
  updateOwnProfileSchema,
} from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { DocumentsSection } from '@/components/documents-section';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

interface EmployeeProfileDetail {
  address: string | null;
  mobilePhone: string | null;
  personalEmail: string | null;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null; // masked - never the real value
}

interface EmergencyContactDetail {
  fullName: string;
  relationship: string;
  mobile: string | null;
  landline: string | null;
  email: string | null;
  address: string | null;
}

interface ProfileChangeRequestRow {
  id: string;
  targetType: 'EMPLOYEE_PROFILE' | 'EMERGENCY_CONTACT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  proposedData: Record<string, unknown>;
  reason: string;
  decisionComment: string | null;
  createdAt: string;
}

// EP-012: unlike the admin drawer's direct-edit version, a self-service save
// here goes through POST /profile-changes and sits PENDING until an admin
// decides it - the form is replaced by a "pending" banner for that section
// while one is outstanding (the backend also blocks a second concurrent
// submission, so this mirrors that rule rather than fighting it).
function PersonalDetailsCard({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reason, setReason] = useState('');
  const [newBankAccountNumber, setNewBankAccountNumber] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['users', userId, 'employee-profile'],
    queryFn: () => api.get<EmployeeProfileDetail | null>(`/users/${userId}/employee-profile`),
  });
  const { data: myRequests } = useQuery({
    queryKey: ['profile-changes', 'mine'],
    queryFn: () => api.get<ProfileChangeRequestRow[]>('/profile-changes/mine'),
  });
  const pending = (myRequests ?? []).find(
    (r) => r.targetType === ProfileChangeTargetType.EMPLOYEE_PROFILE && r.status === 'PENDING',
  );

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

  const submit = useMutation({
    mutationFn: (values: UpdateEmployeeProfileInput) =>
      api.post('/profile-changes', {
        targetType: ProfileChangeTargetType.EMPLOYEE_PROFILE,
        proposedData: newBankAccountNumber.trim()
          ? { ...values, bankAccountNumber: newBankAccountNumber.trim() }
          : values,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-changes', 'mine'] });
      setNewBankAccountNumber('');
      setReason('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not submit this change'),
  });

  return (
    <Card>
      <CardTitle>Personal details</CardTitle>
      {pending ? (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Waiting on admin approval</p>
            <p className="mt-0.5 text-amber-700">
              Submitted {new Date(pending.createdAt).toLocaleString()}. You can submit another change once this one
              is decided.
            </p>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((values) => {
            setError(null);
            submit.mutate(values);
          })}
          className="space-y-3"
        >
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {success && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-2 text-sm text-green-700">
              <CheckCircle size={16} className="shrink-0" aria-hidden="true" />
              <span>Submitted for admin approval.</span>
            </div>
          )}
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
          <Field
            label="Reason for this change"
            error={reason.length > 0 && reason.length < 10 ? `At least 10 characters required (${reason.length}/10)` : undefined}
          >
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you're updating this" />
          </Field>
          <Button
            icon={<Save size={16} aria-hidden="true" />}
            type="submit"
            disabled={reason.trim().length < 10}
            loading={isSubmitting || submit.isPending}
          >
            Submit for approval
          </Button>
        </form>
      )}
    </Card>
  );
}

function EmergencyContactCard({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reason, setReason] = useState('');

  const { data: contact } = useQuery({
    queryKey: ['users', userId, 'emergency-contact'],
    queryFn: () => api.get<EmergencyContactDetail | null>(`/users/${userId}/emergency-contact`),
  });
  const { data: myRequests } = useQuery({
    queryKey: ['profile-changes', 'mine'],
    queryFn: () => api.get<ProfileChangeRequestRow[]>('/profile-changes/mine'),
  });
  const pending = (myRequests ?? []).find(
    (r) => r.targetType === ProfileChangeTargetType.EMERGENCY_CONTACT && r.status === 'PENDING',
  );

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

  const submit = useMutation({
    mutationFn: (values: UpdateEmergencyContactInput) =>
      api.post('/profile-changes', {
        targetType: ProfileChangeTargetType.EMERGENCY_CONTACT,
        proposedData: values,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-changes', 'mine'] });
      setReason('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not submit this change'),
  });

  return (
    <Card>
      <CardTitle>Emergency contact</CardTitle>
      {pending ? (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Waiting on admin approval</p>
            <p className="mt-0.5 text-amber-700">
              Submitted {new Date(pending.createdAt).toLocaleString()}. You can submit another change once this one
              is decided.
            </p>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((values) => {
            setError(null);
            submit.mutate(values);
          })}
          className="space-y-3"
        >
          {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {success && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 p-2 text-sm text-green-700">
              <CheckCircle size={16} className="shrink-0" aria-hidden="true" />
              <span>Submitted for admin approval.</span>
            </div>
          )}
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
          <Field
            label="Reason for this change"
            error={reason.length > 0 && reason.length < 10 ? `At least 10 characters required (${reason.length}/10)` : undefined}
          >
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you're updating this" />
          </Field>
          <Button
            icon={<Save size={16} aria-hidden="true" />}
            type="submit"
            disabled={reason.trim().length < 10}
            loading={isSubmitting || submit.isPending}
          >
            Submit for approval
          </Button>
        </form>
      )}
    </Card>
  );
}

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

      <PersonalDetailsCard userId={user.id} />
      <EmergencyContactCard userId={user.id} />

      <Card>
        <CardTitle>Documents</CardTitle>
        <DocumentsSection userId={user.id} canDelete={false} />
      </Card>
    </div>
  );
}
