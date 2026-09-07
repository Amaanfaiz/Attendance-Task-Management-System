'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginInput, loginSchema } from '@atms/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      await api.post('/auth/login', values);
      await queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      router.push('/my-day');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900">Sign in</h2>
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
