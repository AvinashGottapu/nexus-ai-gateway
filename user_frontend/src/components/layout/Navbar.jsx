import React, { useState } from 'react';
import {
  Layers,
  ChevronDown,
  Sun,
  Moon,
  ExternalLink,
  SlidersHorizontal,
  Check,
  ShieldCheck,
  Shield
} from 'lucide-react';
import { Badge } from '../ui/Badge';

export const UserNavbar = ({
  isDark,
  toggleTheme,
  currentOrg,
  setCurrentOrg,
  currentUser,
  onNavigateToAdmin
}) => {
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const orgs = [
    { id: 'org-prod', name: 'Production Gateway', region: 'ap-south-1 (Mumbai)' },
    { id: 'org-staging', name: 'Staging Cluster', region: 'us-east-1 (N. Virginia)' },
    { id: 'org-dev', name: 'Sandbox Org', region: 'eu-central-1 (Frankfurt)' }
  ];

  return (
    <header className="sticky top-0 z-40 w-full h-14 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800/80 px-4 flex items-center justify-between select-none">
      {/* Brand & Active Workspace */}
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
                  {currentOrg.id === org.id && <Check className="w-3.5 h-3.5 text-indigo-500" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        <Badge variant="success" dot={true} size="sm" className="hidden sm:inline-flex">
          Gateway Operational
        </Badge>

        {/* Quick link to Admin Portal for authorized staff */}
        {onNavigateToAdmin && (
          <button
            onClick={onNavigateToAdmin}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-amber-500" />
            <span>Admin Console</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
            className="flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors"
          >
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.name}
              className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-300 dark:ring-zinc-700"
            />
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 hidden sm:block" />
          </button>

          {isUserDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                  {currentUser.name}
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  {currentUser.email}
                </div>
                <div className="mt-1">
                  <Badge variant="info" size="sm">
                    {currentUser.plan} Tier
                  </Badge>
                </div>
              </div>
              <div className="p-1">
                <a
                  href="https://github.com/AvinashGottapu/nexus-ai-gateway"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 rounded-md"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                  Documentation
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
