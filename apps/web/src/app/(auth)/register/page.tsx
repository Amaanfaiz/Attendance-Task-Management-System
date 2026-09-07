'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterInput, registerSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export default function RegisterPage() {
  const [done, setDone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterInput) => {
    setServerError(null);
    try {
      const result = await api.post<{ status: string }>('/auth/register', values);
      setDone(
        result.status === 'PENDING'
          ? 'Account created. An administrator must approve your account before you can sign in.'
          : 'Account created. You can now sign in.',
      );
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  if (done) {
    return (
      <div className="space-y-4 text-sm">
        <p className="rounded-md bg-green-50 p-3 text-green-800">{done}</p>
        <Link href="/login" className="text-slate-700 underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900">Register</h2>
      {serverError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{serverError}</p>}
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
      <Field label="Password" error={errors.password?.message}>
        <Input type="password" {...register('password')} />
      </Field>
      <p className="text-xs text-slate-500">
        Minimum 10 characters, with an uppercase letter, a lowercase letter and a number.
      </p>
      <div className="flex items-center justify-between text-sm">
        <Link href="/login" className="text-slate-600 hover:underline">
          Already have an account?
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Register
      </Button>
    </form>
  );
}
