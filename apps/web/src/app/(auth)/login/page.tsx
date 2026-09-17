'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { LoginInput, UserRole, loginSchema } from '@atms/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const sessionExpired = searchParams.get('expired') === '1';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      // RISK-015: Auditor has no attendance/tasks of its own - /my-day would
      // land it on a page full of controls (Clock In, task timers) that its
      // own role can't actually use (blocked server-side, but a confusing
      // dead end regardless). Route it straight to its actual landing page.
      const result = await api.post<{ role: string }>('/auth/login', values);
      await queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      router.push(result.role === UserRole.AUDITOR ? '/admin/reports' : '/my-day');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <span className="inline-flex w-fit items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
        Unified Workspace Access
      </span>
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
        <p className="text-sm text-slate-500">Sign in to your ATMS account.</p>
      </div>
      {sessionExpired && !serverError && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Your session has expired. Please log in again.
        </p>
      )}
      {serverError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{serverError}</p>}
      <Field label="Email address" error={errors.email?.message}>
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input type="email" autoComplete="email" className="pl-9" {...register('email')} />
        </div>
      </Field>
      <Field label="Password" error={errors.password?.message}>
        <div className="relative">
          <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
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
      </Field>
      <div className="flex justify-end text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button
        icon={<ArrowRight size={16} aria-hidden="true" />}
        type="submit"
        className="w-full flex-row-reverse"
        loading={isSubmitting}
      >
        Sign In
      </Button>
      <p className="rounded-lg bg-slate-50 py-3 text-center text-sm text-slate-600">
        Need an account?{' '}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
