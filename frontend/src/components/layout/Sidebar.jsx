import React from 'react';
import {
  LayoutDashboard,
  Activity,
  KeyRound,
  CreditCard,
  Settings,
  Users,
  ShieldAlert,
  FileText,
  Sliders,
  Terminal,
  Server,
  Zap
} from 'lucide-react';
import { Badge } from '../ui/Badge';

export const Sidebar = ({ role, activeTab, setActiveTab, pendingHitlCount = 1 }) => {
  const userNavItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'requests', label: 'My Requests', icon: Activity },
    { id: 'keys', label: 'API Keys', icon: KeyRound },
    { id: 'playground', label: 'Test Playground', icon: Terminal },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard },
    { id: 'settings', label: 'Settings & Security', icon: Settings }
  ];

  const adminNavItems = [
    { id: 'overview', label: 'System Overview', icon: LayoutDashboard },
    { id: 'users', label: 'User Directory', icon: Users },
    { id: 'observability', label: 'Gateway Observability', icon: Activity },
    {
      id: 'hitl',
      label: 'HITL Review Queue',
      icon: ShieldAlert,
      badge: pendingHitlCount > 0 ? pendingHitlCount : null,
      badgeVariant: 'warning'
    },
    { id: 'audit', label: 'Audit Logs', icon: FileText },
    { id: 'config', label: 'System Settings', icon: Sliders }
  ];

  const navItems = role === 'admin' ? adminNavItems : userNavItems;

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/50 flex flex-col justify-between p-3 select-none">
      <div className="space-y-4">
        {/* Role Header Banner */}
        <div className="px-3 py-2 rounded-lg bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${role === 'admin' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              {role === 'admin' ? 'Operations Console' : 'User Workspace'}
            </span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            {role.toUpperCase()}
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/10 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge !== null && (
                  <Badge variant={item.badgeVariant || 'neutral'} size="sm">
                    {item.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Gateway Engine Infrastructure Card */}
      <div className="p-3 rounded-xl bg-white dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
            <Server className="w-3.5 h-3.5 text-emerald-500" />
            <span>Nexus Engine</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">v1.4.2</span>
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
          Semantic Cache & Circuit Breakers connected via Upstash HTTPS.
        </div>
        <div className="pt-1 flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
          <Zap className="w-3 h-3" />
          <span>Port 443 REST Active</span>
        </div>
      </div>
    </aside>
  );
};
