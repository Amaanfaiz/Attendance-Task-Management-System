'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ForgotPasswordInput, forgotPasswordSchema } from '@atms/shared';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (values: ForgotPasswordInput) => {
    await api.post('/auth/forgot-password', values);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p className="rounded-md bg-green-50 p-3 text-green-800">
          If that email is registered, a reset link has been sent.
        </p>
        <Link href="/login" className="text-slate-700 underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900">Forgot password</h2>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register('email')} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}
