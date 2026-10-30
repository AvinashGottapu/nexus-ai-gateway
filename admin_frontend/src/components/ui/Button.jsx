import React from 'react';

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  icon = null,
  className = '',
  disabled = false,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg select-none disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-2';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-8',
    md: 'text-sm px-3.5 py-2 gap-2 h-9',
    lg: 'text-base px-4 py-2.5 gap-2.5 h-11'
  }[size] || 'text-sm px-3.5 py-2 gap-2 h-9';

  const variantStyles = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:focus:ring-offset-zinc-950',
    secondary: 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-700 focus:ring-zinc-400 dark:focus:ring-offset-zinc-950',
    destructive: 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm focus:ring-rose-500 dark:focus:ring-offset-zinc-950',
    outline: 'border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-200 focus:ring-zinc-400 dark:focus:ring-offset-zinc-950',
    ghost: 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:ring-zinc-400 dark:focus:ring-offset-zinc-950'
  }[variant] || 'bg-indigo-600 hover:bg-indigo-500 text-white';

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
