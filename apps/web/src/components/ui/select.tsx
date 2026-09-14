'use client';

import { SelectHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Size = 'md' | 'sm' | 'xs';

// Every <select> in the app was still hand-styled with the pre-redesign
// border-slate-300/no-focus-ring look, since only <input> went through a
// shared component - this is the equivalent for <select>, so dropdowns get
// the same brand focus ring everywhere. Sized as explicit variants (not a
// free className override) because the existing usages genuinely need
// different width/padding/text-size combinations (full-width form fields vs.
// compact inline filters vs. tiny inline row-action selects) - without
// tailwind-merge in this project, composing that via a raw className would
// risk conflicting utility classes rather than cleanly overriding them.
const sizeClasses: Record<Size, string> = {
  md: 'w-full rounded-lg px-3 py-2 text-sm',
  sm: 'rounded-lg px-2 py-1 text-sm',
  xs: 'rounded-md px-1.5 py-1 text-xs',
};

export const Select = forwardRef<
  HTMLSelectElement,
  // `uiSize`, not `size` - <select> already has a native `size` HTML attribute
  // (visible row count as a number), so reusing that name for this variant
  // would collide with SelectHTMLAttributes' own `size?: number` and silently
  // break the type (TS narrows the intersection's `size` down to nothing
  // assignable, rather than erroring on the name clash itself).
  SelectHTMLAttributes<HTMLSelectElement> & { uiSize?: Size }
>(({ className, uiSize = 'md', ...props }, ref) => (
  <select
    ref={ref}
    className={clsx(
      'border border-slate-300 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
      sizeClasses[uiSize],
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';
