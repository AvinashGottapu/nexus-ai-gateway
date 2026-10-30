import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Activity,
  KeyRound,
  CreditCard,
  Settings,
  Terminal,
  Server,
  Zap,
  Layers,
  ChevronDown,
  Sun,
  Moon,
  ExternalLink
} from 'lucide-react';
import { Badge } from './components/ui/Badge';

// User Views
import { UserDashboard } from './components/user/UserDashboard';
import { RequestHistory } from './components/user/RequestHistory';
import { KeyManager } from './components/user/KeyManager';
import { InteractivePlayground } from './components/user/InteractivePlayground';
import { BillingUsage } from './components/user/BillingUsage';
import { SecuritySettings } from './components/user/SecuritySettings';

// Mock Data
import {
  INITIAL_API_KEYS,
  INITIAL_REQUESTS,
  INITIAL_USERS,
  USER_METRICS
} from './data/mockData';

export function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isDark, setIsDark] = useState(true);
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);

  const [currentOrg, setCurrentOrg] = useState({
    id: 'org-prod',
    name: 'Production Gateway',
    region: 'ap-south-1 (Mumbai)'
  });

  const orgs = [
    { id: 'org-prod', name: 'Production Gateway', region: 'ap-south-1 (Mumbai)' },
    { id: 'org-staging', name: 'Staging Cluster', region: 'us-east-1 (N. Virginia)' },
    { id: 'org-dev', name: 'Sandbox Org', region: 'eu-central-1 (Frankfurt)' }
  ];

  // User State
  const [apiKeys, setApiKeys] = useState(INITIAL_API_KEYS);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [userMetrics, setUserMetrics] = useState(USER_METRICS);
  const currentUser = INITIAL_USERS[1]; // Sarah Chen (Developer)

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const handleRequestGenerated = (newReq) => {
    setRequests(prev => [newReq, ...prev]);
    if (newReq.isCacheHit) {
      setUserMetrics(prev => ({
        ...prev,
        monthlyApiCalls: prev.monthlyApiCalls + 1,
        cacheSavingsUsd: prev.cacheSavingsUsd + 0.00018
      }));
    } else {
      setUserMetrics(prev => ({
        ...prev,
        monthlyApiCalls: prev.monthlyApiCalls + 1,
        remainingBalanceUsd: Math.max(0, prev.remainingBalanceUsd - newReq.costUsd)
      }));
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'requests', label: 'My Requests', icon: Activity },
    { id: 'keys', label: 'API Keys', icon: KeyRound },
    { id: 'playground', label: 'Test Playground', icon: Terminal },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard },
    { id: 'settings', label: 'Settings & Security', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-150">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-40 w-full h-14 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800/80 px-4 flex items-center justify-between select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-50">
                NEXUS
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-sm bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                Developer Portal
              </span>
            </div>
          </div>

          <div className="hidden md:block h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800" />

          {/* Workspace Selector */}
          <div className="relative">
            <button
              onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700/60"
            >
              <span className="truncate max-w-[140px] font-semibold text-zinc-900 dark:text-zinc-100">
                {currentOrg.name}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            </button>

            {isOrgDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Switch Cluster
                </div>
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      setCurrentOrg(org);
                      setIsOrgDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{org.name}</div>
                      <div className="text-[11px] text-zinc-400">{org.region}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Badge variant="success" dot={true} size="sm" className="hidden sm:inline-flex">
            All Systems Operational
          </Badge>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* User Avatar */}
          <div className="flex items-center gap-2 pl-2">
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.name}
              className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-300 dark:ring-zinc-700"
            />
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-zinc-400 leading-tight">
                {currentUser.plan} Plan
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Compact Sidebar */}
        <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/50 flex flex-col justify-between p-3 select-none">
          <div className="space-y-4">
            <div className="px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  Developer Workspace
                </span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                ACTIVE
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
                        ? 'bg-indigo-600/10 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
                      <span>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                <Server className="w-3.5 h-3.5 text-emerald-500" />
                <span>Nexus Gateway</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">v1.4.2</span>
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
              Sub-millisecond Semantic Cache hits via Upstash HTTPS REST.
            </div>
            <div className="pt-1 flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              <Zap className="w-3 h-3" />
              <span>Operational</span>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-5 md:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'overview' && (
            <UserDashboard
              userMetrics={userMetrics}
              requests={requests}
              apiKeys={apiKeys}
              setActiveTab={setActiveTab}
              openNewKeyModal={() => setIsNewKeyModalOpen(true)}
            />
          )}
          {activeTab === 'requests' && (
            <RequestHistory requests={requests} />
          )}
          {activeTab === 'keys' && (
            <KeyManager
              apiKeys={apiKeys}
              setApiKeys={setApiKeys}
              isModalOpen={isNewKeyModalOpen}
              setIsModalOpen={setIsNewKeyModalOpen}
            />
          )}
          {activeTab === 'playground' && (
            <InteractivePlayground
              apiKeys={apiKeys}
              onRequestGenerated={handleRequestGenerated}
            />
          )}
          {activeTab === 'billing' && (
            <BillingUsage userMetrics={userMetrics} />
          )}
          {activeTab === 'settings' && (
            <SecuritySettings />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
