import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  UserCheck,
  UserX,
  Shield,
  MoreVertical,
  Edit2,
  ExternalLink,
  Ban,
  CheckCircle2,
  UserPlus
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { postToggleUserStatus, postCreateUser, getLiveUsers } from '../../services/api';

export const UserTable = ({ users, setUsers, onImpersonate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [editingUser, setEditingUser] = useState(null);
  const [suspendingUser, setSuspendingUser] = useState(null);
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);

  // New User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('Developer');
  const [newUserPlan, setNewUserPlan] = useState('Tier-1');

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const handleUpdateRole = (e) => {
    e.preventDefault();
    setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
    setEditingUser(null);
  };

  const handleToggleSuspend = async (user) => {
    const nextStatus = user.status === 'Active' ? 'Suspended' : 'Active';
    const isActivating = nextStatus === 'Active';
    
    // Call live backend SQLite toggle endpoint
    try {
      await postToggleUserStatus(user.id || user.key_hash, isActivating);
    } catch (e) {
      console.warn("Could not sync user status toggle to backend:", e);
    }

    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: nextStatus } : u));
    setSuspendingUser(null);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const rpm = newUserPlan.includes('Tier-3') ? 100 : newUserPlan.includes('Tier-2') ? 60 : 30;
    
    // Call backend to persist real API Key & User into SQLite
    try {
      await postCreateUser(newUserName || 'New Developer', 10.0, rpm);
      const refreshed = await getLiveUsers();
      if (refreshed.success && refreshed.data) {
        setUsers(refreshed.data);
      }
    } catch (err) {
      console.warn("Could not sync created user to backend:", err);
    }

    const newUser = {
      id: `usr_${Math.random().toString(16).substring(2, 6)}`,
      name: newUserName,
      email: newUserEmail || `${newUserName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@techcorp.com`,
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUserName || 'User')}&background=6366f1&color=fff`,
      role: newUserRole,
      plan: newUserPlan,
      joinedDate: new Date().toISOString().split('T')[0],
      joined: new Date().toISOString().split('T')[0],
      status: 'Active',
      totalRequests: 0,
      spendUsd: 0.00,
      spentUSD: 0.00
    };
    setUsers(prev => [newUser, ...prev]);
    setIsNewUserModalOpen(false);
    setNewUserName('');
    setNewUserEmail('');
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            User & Organization Directory
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage organization members, role-based access control (RBAC), and gateway quota tiers.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<UserPlus className="w-3.5 h-3.5" />}
          onClick={() => setIsNewUserModalOpen(true)}
        >
          Add New Member
        </Button>
      </div>

      <Card>
        {/* Search & Filter Toolbar */}
        <div className="p-3.5 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/40">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by Name or Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Roles</option>
              <option value="Admin">Admin</option>
              <option value="Developer">Developer</option>
              <option value="Member">Member</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Suspended">Suspended Only</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <Table>
          <TableHeader>
            <TableRow hover={false}>
              <TableHead>User / Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Plan Tier</TableHead>
              <TableHead>Joined Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total Invocations</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((u) => {
              const isSuspended = u.status === 'Suspended';
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <img
                        src={u.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || 'User')}&background=6366f1&color=fff`}
                        alt={u.name}
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-300 dark:ring-zinc-700"
                      />
                      <div>
                        <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">{u.name}</div>
                        <div className="text-[11px] text-zinc-400 font-mono">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'Admin' ? 'info' : 'neutral'} size="sm">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{u.plan}</span>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400 whitespace-nowrap">
                    {u.joinedDate || u.joined || '2026-01-15'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isSuspended ? 'destructive' : 'success'} size="sm" dot={true}>
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {(u.totalRequests || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    ${(Number(u.spendUsd ?? u.spentUSD ?? 0)).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser(u)}
                        title="Edit Role & Plan"
                        icon={<Edit2 className="w-3.5 h-3.5" />}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onImpersonate && onImpersonate(u)}
                        title="Impersonate User View"
                        icon={<ExternalLink className="w-3.5 h-3.5 text-indigo-400" />}
                      >
                        Impersonate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={isSuspended ? 'text-emerald-500 hover:text-emerald-400' : 'text-rose-500 hover:text-rose-400'}
                        onClick={() => setSuspendingUser(u)}
                        title={isSuspended ? "Reactivate User" : "Suspend User"}
                        icon={isSuspended ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      >
                        {isSuspended ? 'Activate' : 'Suspend'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Edit Role & Tier — ${editingUser?.name}`}
        description="Modify permission level and rate-limiting tier."
      >
        {editingUser && (
          <form onSubmit={handleUpdateRole} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Platform Access Role
              </label>
              <select
                value={editingUser.role}
                onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Admin">Admin (Full operations and sentinel control)</option>
                <option value="Developer">Developer (API keys, playground, logs)</option>
                <option value="Member">Member (Read completions & usage)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Account Plan Tier
              </label>
              <select
                value={editingUser.plan}
                onChange={(e) => setEditingUser({ ...editingUser, plan: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Free">Free (10 RPM)</option>
                <option value="Tier-1">Tier-1 (60 RPM)</option>
                <option value="Tier-2">Tier-2 (300 RPM)</option>
                <option value="Enterprise">Enterprise (1,000 RPM)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="ghost" size="sm" type="button" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit">
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Suspend Confirmation Modal */}
      <Modal
        isOpen={!!suspendingUser}
        onClose={() => setSuspendingUser(null)}
        title={suspendingUser?.status === 'Active' ? "Suspend User Account" : "Reactivate User Account"}
        description={
          suspendingUser?.status === 'Active'
            ? `Are you sure you want to suspend ${suspendingUser?.name}? Their API keys will be immediately blocked from routing.`
            : `Reactivate ${suspendingUser?.name}'s account and re-enable API access?`
        }
      >
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" size="sm" onClick={() => setSuspendingUser(null)}>
            Cancel
          </Button>
          <Button
            variant={suspendingUser?.status === 'Active' ? 'destructive' : 'primary'}
            size="sm"
            onClick={() => handleToggleSuspend(suspendingUser)}
          >
            {suspendingUser?.status === 'Active' ? 'Confirm Suspension' : 'Reactivate Account'}
          </Button>
        </div>
      </Modal>

      {/* Create User Modal */}
      <Modal
        isOpen={isNewUserModalOpen}
        onClose={() => setIsNewUserModalOpen(false)}
        title="Add Organization Member"
        description="Invite a new developer or administrator to the Nexus gateway."
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Alex Rivera"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="alex@company.com"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Role
              </label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Admin">Admin</option>
                <option value="Developer">Developer</option>
                <option value="Member">Member</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Plan Tier
              </label>
              <select
                value={newUserPlan}
                onChange={(e) => setNewUserPlan(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Free">Free</option>
                <option value="Tier-1">Tier-1</option>
                <option value="Tier-2">Tier-2</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsNewUserModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Provision Member
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
