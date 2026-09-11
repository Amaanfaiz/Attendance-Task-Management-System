'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
      <h2 className="text-lg font-medium text-slate-900">Sign in</h2>
      {sessionExpired && !serverError && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Your session has expired. Please log in again.
        </p>
      )}
      {serverError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{serverError}</p>}
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...register('email')} />
      </Field>
      <Field label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...register('password')} />
      </Field>
      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-slate-600 hover:underline">
          Forgot password?
        </Link>
        <Link href="/register" className="text-slate-600 hover:underline">
          Create an account
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>
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
