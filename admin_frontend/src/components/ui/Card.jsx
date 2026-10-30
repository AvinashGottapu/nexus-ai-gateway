import React from 'react';

export const Card = ({ children, className = '', ...props }) => (
  <div
    className={`bg-white dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden transition-all duration-150 ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ children, className = '', ...props }) => (
  <h3 className={`text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({ children, className = '', ...props }) => (
  <p className={`text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent = ({ children, className = '', ...props }) => (
  <div className={`p-5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '', ...props }) => (
  <div className={`px-5 py-3.5 bg-zinc-50/50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800/80 ${className}`} {...props}>
    {children}
  </div>
);
