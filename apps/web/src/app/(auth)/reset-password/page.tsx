'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { ResetPasswordInput, resetPasswordSchema } from '@atms/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function PasswordField({
  id,
  field,
  label,
  error,
  register,
}: {
  id: string;
  field: 'password' | 'confirmPassword';
  label: string;
  error?: string;
  register: ReturnType<typeof useForm<ResetPasswordInput>>['register'];
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          className="pl-9 pr-9"
          {...register(field)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  );
}

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
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle size={18} className="shrink-0" aria-hidden="true" />
          <span>Password has been reset. Please sign in with your new password.</span>
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
        <h2 className="text-2xl font-semibold text-slate-900">Set a new password</h2>
        <p className="text-sm text-slate-500">Choose a new password for your ATMS account.</p>
      </div>
      {serverError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{serverError}</p>}
      <input type="hidden" {...register('token')} />
      <PasswordField id="reset-password" field="password" label="New password" error={errors.password?.message} register={register} />
      <PasswordField id="reset-confirm-password" field="confirmPassword" label="Confirm password" error={errors.confirmPassword?.message} register={register} />
      <Button icon={<KeyRound size={16} aria-hidden="true" />} type="submit" className="w-full flex-row-reverse" loading={isSubmitting}>
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
