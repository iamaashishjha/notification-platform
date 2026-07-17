import { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type Icon = LucideIcon | ComponentType<{ size?: number | string; className?: string }>;
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
type ButtonSize = 'sm' | 'md';
type RowActionTone = 'neutral' | 'primary' | 'danger' | 'success';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700',
  secondary: 'border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50',
  danger: 'border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700',
  success: 'border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  ghost: 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'gap-1.5 rounded-md px-2.5 py-1.5 text-xs',
  md: 'gap-2 rounded-md px-3.5 py-2 text-sm',
};

const rowToneClasses: Record<RowActionTone, string> = {
  neutral: 'text-slate-600 hover:bg-slate-100',
  primary: 'text-blue-600 hover:bg-blue-50',
  danger: 'text-red-600 hover:bg-red-50',
  success: 'text-emerald-700 hover:bg-emerald-50',
};

export function Button({
  children,
  icon: IconComponent,
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; icon?: Icon; variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      {...props}
      className={`focus-ring inline-flex items-center justify-center border font-medium disabled:opacity-60 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {IconComponent && <IconComponent size={size === 'sm' ? 13 : 16} className="shrink-0" />}
      {children}
    </button>
  );
}

export function RowActionButton({
  children,
  icon: IconComponent,
  tone = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; icon: Icon; tone?: RowActionTone }) {
  return (
    <button
      {...props}
      className={`focus-ring inline-flex min-w-[86px] items-center justify-start gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-60 ${rowToneClasses[tone]} ${className}`}
    >
      <IconComponent size={13} className="shrink-0" />
      {children}
    </button>
  );
}
