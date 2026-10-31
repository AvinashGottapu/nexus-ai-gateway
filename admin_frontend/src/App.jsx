import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  LayoutDashboard,
  Users,
  Activity,
  FileText,
  Sliders,
  Server,
  Zap,
  Sun,
  Moon,
  ChevronDown,
  AlertTriangle,
  CreditCard,
  Award
} from 'lucide-react';
import { Badge } from './components/ui/Badge';

// Admin Views
import { AdminDashboard } from './components/admin/AdminDashboard';
import { UserTable } from './components/admin/UserTable';
import { ObservabilityMetrics } from './components/admin/ObservabilityMetrics';
import { HITLQueue } from './components/admin/HITLQueue';
import { AuditLogs } from './components/admin/AuditLogs';
import { SystemSettings } from './components/admin/SystemSettings';
import { PaymentsManager } from './components/admin/PaymentsManager';
import { EvaluationStudio } from './components/admin/EvaluationStudio';

// Mock Data
import {
  INITIAL_USERS,
  CIRCUIT_BREAKERS,
  INITIAL_HITL_TICKETS,
  INITIAL_AUDIT_LOGS,
  SYSTEM_METRICS
} from './data/mockData';
import { getLiveCircuitBreakers, getLiveObservabilityMetrics, getLiveHitlTickets, getLiveUsers } from './services/api';

export function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isDark, setIsDark] = useState(true);

  // Admin Operational State
  const [users, setUsers] = useState(INITIAL_USERS);
  const [circuitBreakers, setCircuitBreakers] = useState(CIRCUIT_BREAKERS);
  const [hitlTickets, setHitlTickets] = useState(INITIAL_HITL_TICKETS);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [systemMetrics, setSystemMetrics] = useState(SYSTEM_METRICS);

  const pendingHitlCount = hitlTickets.filter(t => t.status === 'Pending').length;
  const currentAdmin = users[0]; // Avinash Gottapu (Admin)

  // Fetch live Upstash Redis telemetry & Circuit Breaker status on mount
  useEffect(() => {
    getLiveCircuitBreakers().then(res => {
      if (res.success && res.data) {
        setCircuitBreakers(prev => prev.map(cb => {
          const provKey = cb.provider.toLowerCase();
          if (res.data[provKey]) {
            return {
              ...cb,
              state: res.data[provKey].state || cb.state,
              failureCount: res.data[provKey].consecutive_failures ?? cb.failureCount
            };
          }
          return cb;
        }));
      }
    });

    getLiveObservabilityMetrics().then(res => {
      if (res.success && res.data) {
        const liveP95 = res.data.latency?.p95_ms ?? res.data.p95_latency_ms;
        const liveTokens = res.data.consumption?.total_tokens ?? res.data.total_tokens;
        const liveSpend = res.data.consumption?.total_spend_usd ?? res.data.total_spend_usd;
        const liveHitRatio = res.data.cache_hit_ratio_percent ?? (res.data.cache_hit_ratio ? parseFloat(res.data.cache_hit_ratio) : null);

        setSystemMetrics(prev => ({
          ...prev,
          totalRequests: res.data.total_requests !== undefined ? res.data.total_requests : prev.totalRequests,
          p95LatencyMs: (liveP95 !== undefined && liveP95 > 0) ? Math.round(liveP95) : prev.p95LatencyMs,
          totalTokens: liveTokens !== undefined && liveTokens > 0 ? liveTokens : prev.totalTokens,
          estimatedCostUsd: liveSpend !== undefined && liveSpend > 0 ? liveSpend : prev.estimatedCostUsd,
          cacheHitRatio: liveHitRatio !== null ? liveHitRatio : prev.cacheHitRatio
        }));
      }
    });

    getLiveHitlTickets().then(res => {
      if (res.success && res.data && res.data.length > 0) {
        setHitlTickets(res.data);
      }
    });

    getLiveUsers().then(res => {
      if (res.success && res.data && res.data.length > 0) {
        setUsers(res.data);
      }
    });
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const navItems = [
    { id: 'overview', label: 'System Overview', icon: LayoutDashboard },
    { id: 'evals', label: 'Evals & Benchmarks', icon: Award, badge: 'Live', badgeVariant: 'success' },
    { id: 'payments', label: 'All Payments & Ledger', icon: CreditCard },
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

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-150 overflow-hidden">
      {/* Admin Top Bar */}
      <header className="shrink-0 z-40 w-full h-14 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 shadow-xs">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-100">
                NEXUS
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Operations Console
              </span>
            </div>
          </div>

          <div className="hidden md:block h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800" />

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Cluster: ap-south-1 (Mumbai)</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Badge variant="warning" dot={true} size="sm" className="hidden sm:inline-flex">
            1 Circuit Breaker Alert (OpenAI)
          </Badge>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* Admin Avatar */}
          <div className="flex items-center gap-2 pl-2">
            <img
              src={currentAdmin?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces'}
              alt={currentAdmin?.name || 'Admin'}
              className="w-7 h-7 rounded-full object-cover ring-1 ring-amber-500/40"
            />
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                {currentAdmin?.name || 'Avinash Gottapu'}
              </div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight font-medium">
                Cluster Administrator
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Admin Sidebar */}
        <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/90 flex flex-col justify-between p-3 select-none overflow-y-auto">
          <div className="space-y-4">
            <div className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Operations Console
                </span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400">
                ADMIN
              </span>
            </div>

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
                        ? 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`} />
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

          <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                <Server className="w-3.5 h-3.5 text-amber-500" />
                <span>Sentinel Supervisor</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">Active</span>
            </div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight">
              Circuit breakers, failover cascades, and backups armed.
            </div>
            <div className="pt-1 flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              <Zap className="w-3 h-3" />
              <span>Port 443 Upstash REST</span>
            </div>
          </div>
        </aside>

        {/* Admin Content Area */}
        <main className="flex-1 overflow-y-auto p-5 md:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'overview' && (
            <AdminDashboard
              metrics={systemMetrics}
              circuitBreakers={circuitBreakers}
              setCircuitBreakers={setCircuitBreakers}
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === 'evals' && (
            <EvaluationStudio />
          )}
          {activeTab === 'payments' && (
            <PaymentsManager />
          )}
          {activeTab === 'users' && (
            <UserTable
              users={users}
              setUsers={setUsers}
            />
          )}
          {activeTab === 'observability' && (
            <ObservabilityMetrics
              metrics={systemMetrics}
              circuitBreakers={circuitBreakers}
            />
          )}
          {activeTab === 'hitl' && (
            <HITLQueue
              hitlTickets={hitlTickets}
              setHitlTickets={setHitlTickets}
            />
          )}
          {activeTab === 'audit' && (
            <AuditLogs logs={auditLogs} />
          )}
          {activeTab === 'config' && (
            <SystemSettings />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
