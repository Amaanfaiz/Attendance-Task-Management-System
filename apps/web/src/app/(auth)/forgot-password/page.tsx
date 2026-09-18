'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, Mail, Send } from 'lucide-react';
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
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle size={18} className="shrink-0" aria-hidden="true" />
          <span>If that email is registered, a reset link has been sent.</span>
        </div>
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Forgot password?</h2>
        <p className="text-sm text-slate-500">Enter your email and we&rsquo;ll send you a reset link.</p>
      </div>
      <Field label="Email address" error={errors.email?.message}>
        <div className="relative">
          <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input type="email" autoComplete="email" className="pl-9" {...register('email')} />
        </div>
      </Field>
      <Button icon={<Send size={16} aria-hidden="true" />} type="submit" className="w-full flex-row-reverse" loading={isSubmitting}>
        Send reset link
      </Button>
      <p className="rounded-lg bg-slate-50 py-3 text-center text-sm text-slate-600">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
