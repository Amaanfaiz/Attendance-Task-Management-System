'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300',
  secondary: 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }
>(({ className, variant = 'primary', loading, children, disabled, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={clsx(
      'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
      variantClasses[variant],
      className,
    )}
    {...props}
  >
    {loading ? 'Please wait…' : children}
  </button>
));
Button.displayName = 'Button';
