import React from 'react';

export const Badge = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = ''
}) => {
  const variantStyles = {
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    destructive: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    info: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    neutral: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
  }[variant] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';

  const dotColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    destructive: 'bg-rose-500',
    info: 'bg-indigo-500',
    neutral: 'bg-zinc-400'
  }[variant] || 'bg-zinc-400';

  const sizeStyles = {
    sm: 'text-[11px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-0.5 gap-1.5',
    lg: 'text-sm px-2.5 py-1 gap-1.5'
  }[size] || 'text-xs px-2 py-0.5 gap-1.5';

  return (
    <span className={`inline-flex items-center font-medium border rounded-md ${variantStyles} ${sizeStyles} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors}`} />}
      {children}
    </span>
  );
};
