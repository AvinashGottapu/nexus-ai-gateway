import React, { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Globe,
  Terminal,
  CheckCircle2,
  XCircle,
  Power,
  RefreshCw,
  ExternalLink,
  Layers,
  Cpu,
  Sparkles,
  Info,
  ShieldCheck,
  AlertCircle,
  Play
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import {
  getLiveMCPServers,
  addMCPServer,
  deleteMCPServer,
  toggleMCPServer
} from '../../services/api';

export function MCPServerManager({ onSwitchToPlayground }) {
  const [servers, setServers] = useState([]);
  const [stats, setStats] = useState({ total_configured: 0, total_connected: 0, total_tools_available: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [transportType, setTransportType] = useState('stdio'); // 'stdio' | 'sse'
  const [serverName, setServerName] = useState('');
  const [command, setCommand] = useState('npx');
  const [argsStr, setArgsStr] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [envPairs, setEnvPairs] = useState([{ key: '', value: '' }]);

  // Fetch servers from backend
  const fetchServers = async () => {
    setIsLoading(true);
    try {
      const res = await getLiveMCPServers();
      if (res.success && res.data) {
        setServers(res.data.servers || []);
        setStats({
          total_configured: res.data.total_configured || 0,
          total_connected: res.data.total_connected || 0,
          total_tools_available: res.data.total_tools_available || 0
        });
      }
    } catch (err) {
      setErrorMsg('Failed to load MCP servers: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();

    // Auto-poll every 1.8s so connection state & tool counts sync in real time on startup
    const interval = setInterval(() => {
      getLiveMCPServers().then(res => {
        if (res.success && res.data) {
          setServers(res.data.servers || []);
          setStats({
            total_configured: res.data.total_configured || 0,
            total_connected: res.data.total_connected || 0,
            total_tools_available: res.data.total_tools_available || 0
          });
        }
      }).catch(() => {});
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  // Handle Preset Selection
  const applyPreset = (preset) => {
    if (preset === 'github') {
      setTransportType('stdio');
      setServerName('github-tools');
      setCommand('npx');
      setArgsStr('-y @modelcontextprotocol/server-github');
      setEnvPairs([{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: '' }]);
    } else if (preset === 'postgres') {
      setTransportType('stdio');
      setServerName('postgres-db');
      setCommand('npx');
      setArgsStr('-y @modelcontextprotocol/server-postgres postgresql://user:pass@localhost:5432/mydb');
      setEnvPairs([{ key: '', value: '' }]);
    } else if (preset === 'fetch') {
      setTransportType('stdio');
      setServerName('web-fetch');
      setCommand('npx');
      setArgsStr('-y @modelcontextprotocol/server-fetch');
      setEnvPairs([{ key: '', value: '' }]);
    } else if (preset === 'nexus-local') {
      setTransportType('stdio');
      setServerName('nexus-local');
      setCommand('d:\\WEB\\PROJECTS\\AI_BACKEND_PLATFORM\\.venv\\Scripts\\python.exe');
      setArgsStr('d:\\WEB\\PROJECTS\\AI_BACKEND_PLATFORM\\backend\\mcp_server.py');
      setEnvPairs([{ key: '', value: '' }]);
    } else if (preset === 'remote-example') {
      setTransportType('sse');
      setServerName('cloud-telemetry');
      setServerUrl('https://mcp.mycompany.com/sse');
    }
  };

  // Add / Connect Server
  const handleAddServer = async (e) => {
    e.preventDefault();
    if (!serverName.trim()) {
      setErrorMsg('Please enter a server name.');
      return;
    }

    const envObj = {};
    envPairs.forEach(p => {
      if (p.key.trim()) envObj[p.key.trim()] = p.value.trim();
    });

    const payload = {
      name: serverName.trim().toLowerCase().replace(/\s+/g, '-'),
      transport: transportType,
      enabled: true,
      env: envObj
    };

    if (transportType === 'sse') {
      if (!serverUrl.trim()) {
        setErrorMsg('Please enter an SSE URL.');
        return;
      }
      payload.url = serverUrl.trim();
    } else {
      if (!command.trim()) {
        setErrorMsg('Please specify an executable command (e.g. npx, python).');
        return;
      }
      payload.command = command.trim();
      payload.args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
    }

    setActionLoading('add');
    setErrorMsg('');
    try {
      const res = await addMCPServer(payload);
      if (res.success) {
        setSuccessMsg(`MCP Server '${payload.name}' connected successfully!`);
        setIsModalOpen(false);
        // Reset form
        setServerName('');
        setArgsStr('');
        setServerUrl('');
        setEnvPairs([{ key: '', value: '' }]);
        fetchServers();
      } else {
        setErrorMsg('Failed to connect: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle Server
  const handleToggle = async (name) => {
    setActionLoading(name);
    try {
      const res = await toggleMCPServer(name);
      if (res.success) {
        fetchServers();
      }
    } catch (err) {
      setErrorMsg('Toggle failed: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete Server
  const handleDelete = async (name) => {
    if (!window.confirm(`Are you sure you want to disconnect and delete '${name}'?`)) return;
    setActionLoading(name);
    try {
      const res = await deleteMCPServer(name);
      if (res.success) {
        setSuccessMsg(`Server '${name}' removed.`);
        fetchServers();
      }
    } catch (err) {
      setErrorMsg('Delete failed: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center justify-between text-rose-400 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="hover:text-rose-200">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-between text-emerald-400 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="hover:text-emerald-200">✕</button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-500" />
              Model Context Protocol (MCP) Tools Hub
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              Host Integration
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Connect personal external MCP tools via local subprocess (<code className="text-zinc-700 dark:text-zinc-300">stdio</code>) or remote web streams (<code className="text-zinc-700 dark:text-zinc-300">SSE</code>). Discovered tools are available live in your Interactive Playground!
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onSwitchToPlayground && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSwitchToPlayground}
              className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10"
            >
              <Play className="w-3.5 h-3.5" />
              Test in Playground
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchServers}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-xs text-xs"
          >
            <Plus className="w-4 h-4" />
            Connect MCP Server
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            <span>Configured Servers</span>
            <Server className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-zinc-900 dark:text-zinc-100">
            {stats.total_configured}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Registered in <code className="text-zinc-700 dark:text-zinc-300">mcp_servers.json</code>
          </div>
        </Card>

        <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            <span>Active Connections</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            {stats.total_connected}
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Live JSON-RPC stdio / SSE pipes
          </div>
        </Card>

        <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            <span>Discovered Tools</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold mt-2 text-amber-500">
            {stats.total_tools_available}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Available across Groq & Gemini
          </div>
        </Card>

        <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            <span>Playground Tools</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-sm font-bold mt-3 text-blue-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Multi-LLM Tool Calling
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Groq, Gemini & OpenAI
          </div>
        </Card>
      </div>

      {/* Servers List */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Your MCP Server Connections
            </h2>
          </div>
          <span className="text-xs text-zinc-500">
            {servers.length} server(s) registered
          </span>
        </div>

        {servers.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="w-10 h-10 text-zinc-400 mx-auto mb-3 opacity-60" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No MCP Servers Connected</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              Add a local subprocess or remote SSE server to give your AI models superpowers like GitHub access, database querying, or web scraping.
            </p>
            <Button
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add First Server
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {servers.map((server) => (
              <div key={server.name} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      {server.name}
                    </span>
                    <Badge variant={server.connected ? 'success' : server.enabled ? 'warning' : 'default'}>
                      {server.connected ? '🟢 Connected' : server.enabled ? '🟡 Initializing (~2s)...' : '⚪ Disabled'}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      {server.transport === 'sse' ? <Globe className="w-3 h-3 text-blue-400" /> : <Terminal className="w-3 h-3 text-emerald-400" />}
                      {server.transport.toUpperCase()}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {server.tool_count} tool(s) registered
                    </span>
                  </div>

                  {/* Discovered Tools Chips */}
                  {server.tools && server.tools.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Tools:</span>
                      {server.tools.map((toolName) => (
                        <span
                          key={toolName}
                          className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20"
                        >
                          {toolName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading === server.name}
                    onClick={() => handleToggle(server.name)}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Power className={`w-3.5 h-3.5 ${server.enabled ? 'text-emerald-500' : 'text-zinc-400'}`} />
                    {server.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading === server.name}
                    onClick={() => handleDelete(server.name)}
                    className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border-zinc-200 dark:border-zinc-800 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Server Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Connect New Model Context Protocol (MCP) Server"
      >
        <form onSubmit={handleAddServer} className="space-y-4">
          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">
              Quick 1-Click Templates:
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => applyPreset('nexus-local')}
                className="text-[11px] px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-500/20 hover:text-indigo-400 border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                ⚡ Nexus Local Gateway
              </button>
              <button
                type="button"
                onClick={() => applyPreset('fetch')}
                className="text-[11px] px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-500/20 hover:text-indigo-400 border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                🌐 Web Fetch Server
              </button>
              <button
                type="button"
                onClick={() => applyPreset('github')}
                className="text-[11px] px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-500/20 hover:text-indigo-400 border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                🐙 GitHub Server
              </button>
              <button
                type="button"
                onClick={() => applyPreset('postgres')}
                className="text-[11px] px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-500/20 hover:text-indigo-400 border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                🐘 PostgreSQL Server
              </button>
              <button
                type="button"
                onClick={() => applyPreset('remote-example')}
                className="text-[11px] px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-500/20 hover:text-indigo-400 border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                ☁️ Remote Cloud SSE
              </button>
            </div>
          </div>

          {/* Transport Mode Switch */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Transport Type:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTransportType('stdio')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                  transportType === 'stdio'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-semibold'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-800/40 text-zinc-500'
                }`}
              >
                <Terminal className="w-4 h-4" />
                Local Subprocess (stdio)
              </button>
              <button
                type="button"
                onClick={() => setTransportType('sse')}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                  transportType === 'sse'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-semibold'
                    : 'border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-800/40 text-zinc-500'
                }`}
              >
                <Globe className="w-4 h-4" />
                Remote Cloud URL (SSE)
              </button>
            </div>
          </div>

          {/* Server Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Server Identifier / Name:
            </label>
            <input
              type="text"
              required
              placeholder="e.g. web-fetch, github-tools, postgres"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          {/* Stdio Specific Inputs */}
          {transportType === 'stdio' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Executable Command:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. npx, python, node"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Arguments (space separated):
                </label>
                <input
                  type="text"
                  placeholder="e.g. -y @modelcontextprotocol/server-github"
                  value={argsStr}
                  onChange={(e) => setArgsStr(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Environment Variables */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Environment Variables (Tokens / DB URIs):
                  </label>
                  <button
                    type="button"
                    onClick={() => setEnvPairs([...envPairs, { key: '', value: '' }])}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300"
                  >
                    + Add Variable
                  </button>
                </div>
                {envPairs.map((p, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="KEY (e.g. GITHUB_TOKEN)"
                      value={p.key}
                      onChange={(e) => {
                        const copy = [...envPairs];
                        copy[idx].key = e.target.value;
                        setEnvPairs(copy);
                      }}
                      className="w-1/2 px-2.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-xs font-mono"
                    />
                    <input
                      type="password"
                      placeholder="VALUE"
                      value={p.value}
                      onChange={(e) => {
                        const copy = [...envPairs];
                        copy[idx].value = e.target.value;
                        setEnvPairs(copy);
                      }}
                      className="w-1/2 px-2.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-xs font-mono"
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Remote SSE URL:
              </label>
              <input
                type="url"
                required
                placeholder="https://mcp.yourcompany.com/sse"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={actionLoading === 'add'}
              className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5"
            >
              {actionLoading === 'add' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Save & Connect Server'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
