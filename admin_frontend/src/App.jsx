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
  CreditCard
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

// Mock Data
import {
  INITIAL_USERS,
  CIRCUIT_BREAKERS,
  INITIAL_HITL_TICKETS,
  INITIAL_AUDIT_LOGS,
  SYSTEM_METRICS
} from './data/mockData';
import { getLiveCircuitBreakers, getLiveObservabilityMetrics, getLiveHitlTickets } from './services/api';

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
        setSystemMetrics(prev => ({
          ...prev,
          totalRequests: res.data.total_requests || prev.totalRequests,
          p95LatencyMs: Math.round(res.data.p95_latency_ms || prev.p95LatencyMs),
          totalTokens: res.data.total_tokens || prev.totalTokens,
          cacheHitRatio: res.data.cache_hit_ratio_percent ? parseFloat(res.data.cache_hit_ratio_percent) : prev.cacheHitRatio
        }));
      }
    });

    getLiveHitlTickets().then(res => {
      if (res.success && res.data && res.data.length > 0) {
        setHitlTickets(res.data);
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans transition-colors duration-150">
      {/* Admin Top Bar */}
      <header className="sticky top-0 z-40 w-full h-14 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 px-4 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xs">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm tracking-tight text-zinc-100">
                NEXUS
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Operations Console
              </span>
            </div>
          </div>

          <div className="hidden md:block h-4 w-[1px] bg-zinc-800" />

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
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
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>

          {/* Admin Avatar */}
          <div className="flex items-center gap-2 pl-2">
            <img
              src={currentAdmin.avatarUrl}
              alt={currentAdmin.name}
              className="w-7 h-7 rounded-full object-cover ring-1 ring-amber-500/40"
            />
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-zinc-100 leading-tight">
                {currentAdmin.name}
              </div>
              <div className="text-[10px] text-amber-400 leading-tight font-medium">
                Cluster Administrator
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Admin Sidebar */}
        <aside className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-950/80 flex flex-col justify-between p-3 select-none">
          <div className="space-y-4">
            <div className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Operations Console
                </span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
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
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-zinc-400'}`} />
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

          <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
                <Server className="w-3.5 h-3.5 text-amber-500" />
                <span>Sentinel Supervisor</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">Active</span>
            </div>
            <div className="text-[11px] text-zinc-400 leading-tight">
              Circuit breakers, failover cascades, and backups armed.
            </div>
            <div className="pt-1 flex items-center gap-2 text-[10px] text-emerald-400 font-medium">
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
