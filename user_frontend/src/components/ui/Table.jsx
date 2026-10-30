import React from 'react';

export const Table = ({ children, className = '' }) => (
  <div className="w-full overflow-x-auto">
    <table className={`w-full text-left text-sm border-collapse ${className}`}>
      {children}
    </table>
  </div>
);

export const TableHeader = ({ children, className = '' }) => (
  <thead className={`border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50/50 dark:bg-zinc-900/50 ${className}`}>
    {children}
  </thead>
);

export const TableBody = ({ children, className = '' }) => (
  <tbody className={`divide-y divide-zinc-200/70 dark:divide-zinc-800/60 ${className}`}>
    {children}
  </tbody>
);

export const TableRow = ({ children, className = '', hover = true, ...props }) => (
  <tr
    className={`transition-colors duration-100 ${hover ? 'hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40' : ''} ${className}`}
    {...props}
  >
    {children}
  </tr>
);

export const TableHead = ({ children, className = '' }) => (
  <th className={`px-4 py-3 font-semibold ${className}`}>
    {children}
  </th>
);

export const TableCell = ({ children, className = '' }) => (
  <td className={`px-4 py-3.5 text-zinc-700 dark:text-zinc-300 align-middle ${className}`}>
    {children}
  </td>
);
