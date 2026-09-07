'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ResetPasswordInput, resetPasswordSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = async (values: ResetPasswordInput) => {
    setServerError(null);
    try {
      await api.post('/auth/reset-password', values);
      setDone(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  };

  if (done) {
    return (
      <div className="space-y-4 text-sm">
        <p className="rounded-md bg-green-50 p-3 text-green-800">
          Password has been reset. Please sign in with your new password.
        </p>
        <Link href="/login" className="text-slate-700 underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900">Set a new password</h2>
      {serverError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{serverError}</p>}
      <input type="hidden" {...register('token')} />
      <Field label="New password" error={errors.password?.message}>
        <Input type="password" {...register('password')} />
      </Field>
      <Field label="Confirm password" error={errors.confirmPassword?.message}>
        <Input type="password" {...register('confirmPassword')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Reset password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
