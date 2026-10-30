import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';

// User Views
import { UserDashboard } from './components/user/UserDashboard';
import { RequestHistory } from './components/user/RequestHistory';
import { KeyManager } from './components/user/KeyManager';
import { InteractivePlayground } from './components/user/InteractivePlayground';
import { BillingUsage } from './components/user/BillingUsage';
import { SecuritySettings } from './components/user/SecuritySettings';

// Admin Views
import { AdminDashboard } from './components/admin/AdminDashboard';
import { UserTable } from './components/admin/UserTable';
import { HITLQueue } from './components/admin/HITLQueue';
import { AuditLogs } from './components/admin/AuditLogs';
import { ObservabilityMetrics } from './components/admin/ObservabilityMetrics';
import { SystemSettings } from './components/admin/SystemSettings';

// Data
import {
  INITIAL_API_KEYS,
  INITIAL_REQUESTS,
  INITIAL_USERS,
  CIRCUIT_BREAKERS,
  INITIAL_HITL_TICKETS,
  INITIAL_AUDIT_LOGS,
  SYSTEM_METRICS,
  USER_METRICS
} from './data/mockData';

export function App() {
  // Role & Theme State
  const [role, setRole] = useState('user');
  const [isDark, setIsDark] = useState(true);
  const [currentOrg, setCurrentOrg] = useState({
    id: 'org-prod',
    name: 'Production Gateway',
    region: 'ap-south-1 (Mumbai)'
  });

  // Active Navigation Tab
  const [userTab, setUserTab] = useState('overview');
  const [adminTab, setAdminTab] = useState('overview');

  // Impersonation state
  const [impersonatedUser, setImpersonatedUser] = useState(null);

  // Modals
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);

  // Shared Data States
  const [apiKeys, setApiKeys] = useState(INITIAL_API_KEYS);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [users, setUsers] = useState(INITIAL_USERS);
  const [circuitBreakers, setCircuitBreakers] = useState(CIRCUIT_BREAKERS);
  const [hitlTickets, setHitlTickets] = useState(INITIAL_HITL_TICKETS);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [systemMetrics, setSystemMetrics] = useState(SYSTEM_METRICS);
  const [userMetrics, setUserMetrics] = useState(USER_METRICS);

  // Sync theme with HTML document class
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const pendingHitlCount = hitlTickets.filter(t => t.status === 'Pending').length;

  // Handle when playground runs a query
  const handleRequestGenerated = (newReq) => {
    setRequests(prev => [newReq, ...prev]);
    // Also record an audit log
    const newLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      actor: impersonatedUser ? impersonatedUser.email : 'avinash@nexusgate.io',
      role: 'User',
      eventType: newReq.isCacheHit ? 'CACHE_HIT' : 'INFERENCE_SUCCESS',
      severity: 'INFO',
      ipAddress: '127.0.0.1',
      details: `${newReq.endpoint} (${newReq.model}) completed in ${newReq.latencyMs}ms. Tokens: ${newReq.tokens}`
    };
    setAuditLogs(prev => [newLog, ...prev]);

    // Update metrics
    if (newReq.isCacheHit) {
      setUserMetrics(prev => ({
        ...prev,
        monthlyApiCalls: prev.monthlyApiCalls + 1,
        cacheSavingsUsd: prev.cacheSavingsUsd + 0.00018
      }));
      setSystemMetrics(prev => ({
        ...prev,
        totalRequests: prev.totalRequests + 1,
        savedCostUsd: prev.savedCostUsd + 0.00018
      }));
    } else {
      setUserMetrics(prev => ({
        ...prev,
        monthlyApiCalls: prev.monthlyApiCalls + 1,
        remainingBalanceUsd: Math.max(0, prev.remainingBalanceUsd - newReq.costUsd)
      }));
      setSystemMetrics(prev => ({
        ...prev,
        totalRequests: prev.totalRequests + 1,
        estimatedCostUsd: prev.estimatedCostUsd + newReq.costUsd,
        totalTokens: prev.totalTokens + newReq.tokens
      }));
    }
  };

  const handleImpersonate = (targetUser) => {
    setImpersonatedUser(targetUser);
    setRole('user');
    setUserTab('overview');
  };

  const handleExitImpersonation = () => {
    setImpersonatedUser(null);
    setRole('admin');
    setAdminTab('users');
  };

  const currentUser = impersonatedUser || users[0];

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-150">
      {/* Impersonation Sentinel Banner */}
      {impersonatedUser && (
        <div className="bg-amber-500 text-zinc-950 px-4 py-2 text-xs font-semibold flex items-center justify-between select-none shadow-md z-50">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zinc-950 animate-ping" />
            <span>
              Impersonation Mode Active: Viewing gateway as <strong>{impersonatedUser.name}</strong> ({impersonatedUser.email}) — Plan: {impersonatedUser.plan}
            </span>
          </div>
          <button
            onClick={handleExitImpersonation}
            className="px-2.5 py-0.5 rounded bg-zinc-950 text-amber-400 hover:bg-zinc-900 text-xs font-bold transition-all"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      {/* Top Application Bar */}
      <Navbar
        role={role}
        setRole={setRole}
        isDark={isDark}
        toggleTheme={toggleTheme}
        currentOrg={currentOrg}
        setCurrentOrg={setCurrentOrg}
        currentUser={currentUser}
      />

      {/* Main Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          role={role}
          activeTab={role === 'admin' ? adminTab : userTab}
          setActiveTab={role === 'admin' ? setAdminTab : setUserTab}
          pendingHitlCount={pendingHitlCount}
        />

        {/* Center Main Content Area */}
        <main className="flex-1 overflow-y-auto p-5 md:p-8 max-w-7xl mx-auto w-full">
          {role === 'user' ? (
            /* USER PORTAL VIEWS */
            <>
              {userTab === 'overview' && (
                <UserDashboard
                  userMetrics={userMetrics}
                  requests={requests}
                  apiKeys={apiKeys}
                  setActiveTab={setUserTab}
                  openNewKeyModal={() => setIsNewKeyModalOpen(true)}
                />
              )}
              {userTab === 'requests' && (
                <RequestHistory requests={requests} />
              )}
              {userTab === 'keys' && (
                <KeyManager
                  apiKeys={apiKeys}
                  setApiKeys={setApiKeys}
                  isModalOpen={isNewKeyModalOpen}
                  setIsModalOpen={setIsNewKeyModalOpen}
                />
              )}
              {userTab === 'playground' && (
                <InteractivePlayground
                  apiKeys={apiKeys}
                  onRequestGenerated={handleRequestGenerated}
                />
              )}
              {userTab === 'billing' && (
                <BillingUsage userMetrics={userMetrics} />
              )}
              {userTab === 'settings' && (
                <SecuritySettings />
              )}
            </>
          ) : (
            /* ADMIN PORTAL VIEWS */
            <>
              {adminTab === 'overview' && (
                <AdminDashboard
                  metrics={systemMetrics}
                  circuitBreakers={circuitBreakers}
                  setCircuitBreakers={setCircuitBreakers}
                  setActiveTab={setAdminTab}
                />
              )}
              {adminTab === 'users' && (
                <UserTable
                  users={users}
                  setUsers={setUsers}
                  onImpersonate={handleImpersonate}
                />
              )}
              {adminTab === 'observability' && (
                <ObservabilityMetrics
                  metrics={systemMetrics}
                  circuitBreakers={circuitBreakers}
                />
              )}
              {adminTab === 'hitl' && (
                <HITLQueue
                  hitlTickets={hitlTickets}
                  setHitlTickets={setHitlTickets}
                />
              )}
              {adminTab === 'audit' && (
                <AuditLogs logs={auditLogs} />
              )}
              {adminTab === 'config' && (
                <SystemSettings />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
