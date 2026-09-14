'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-200',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-slate-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 disabled:bg-red-300',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }
>(({ className, variant = 'primary', loading, children, disabled, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={clsx(
      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
      variantClasses[variant],
      className,
    )}
    {...props}
  >
    {loading ? 'Please wait…' : children}
  </button>
));
Button.displayName = 'Button';
