'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle, Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react';
import { RegisterInput, registerSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export default function RegisterPage() {
  const [done, setDone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle size={18} className="shrink-0" aria-hidden="true" />
          <span>{done}</span>
        </div>
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <span className="inline-flex w-fit items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
        Unified Workspace Access
      </span>
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Create your account</h2>
        <p className="text-sm text-slate-500">Register for ATMS access.</p>
      </div>
      {serverError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{serverError}</p>}
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
      <Field label="Email address" error={errors.email?.message}>
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input type="email" autoComplete="email" className="pl-9" {...register('email')} />
        </div>
      </Field>
      <Field label="Phone number" error={errors.phoneNumber?.message}>
        <div className="relative">
          <Phone size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input type="tel" className="pl-9" {...register('phoneNumber')} />
        </div>
      </Field>
      <div>
        <label htmlFor="register-password" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            id="register-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="pl-9 pr-9"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        </div>
        {errors.password?.message ? (
          <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Minimum 10 characters, with an uppercase letter, a lowercase letter and a number.
          </p>
        )}
      </div>
      <Button icon={<ArrowRight size={16} aria-hidden="true" />} type="submit" className="w-full flex-row-reverse" loading={isSubmitting}>
        Register
      </Button>
      <p className="rounded-lg bg-slate-50 py-3 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
