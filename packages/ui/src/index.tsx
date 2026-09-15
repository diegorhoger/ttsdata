/**
 * Shared UI components
 */

import React from 'react';
import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-800',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-sky-100 text-sky-800',
  };

  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}

interface ScoreBadgeProps {
  score: number;
  confidence?: 'low' | 'medium' | 'high';
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, confidence, size = 'md' }: ScoreBadgeProps) {
  const color = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-slate-600';
  const sizes = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' };

  return (
    <div className="text-center">
      <div className={clsx('font-bold', color, sizes[size])}>{score}</div>
      {confidence && (
        <div className="text-xs text-slate-500 capitalize">{confidence}</div>
      )}
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={clsx('rounded-xl bg-white p-6 shadow-sm border border-slate-200', className)}>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' }) {
  const variants = {
    primary: 'bg-sky-600 text-white hover:bg-sky-700',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
  };

  return (
    <button
      className={clsx('rounded-lg px-4 py-2 font-medium min-h-[44px] min-w-[44px]', variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
}
