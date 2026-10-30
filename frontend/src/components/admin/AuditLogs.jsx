import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  FileText,
  Download,
  AlertCircle,
  Info,
  AlertTriangle,
  Terminal,
  Copy,
  Check
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table';

export const AuditLogs = ({ logs }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchesSearch =
        l.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.eventType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.details.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSeverity = severityFilter === 'ALL' || l.severity === severityFilter;

      return matchesSearch && matchesSeverity;
    });
  }, [logs, searchQuery, severityFilter]);

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Security & Audit Logs
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Immutable system events including circuit breaker state transitions, backup routines, and guardrail enforcement.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          icon={<Download className="w-3.5 h-3.5" />}
          onClick={() => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "nexus_audit_logs.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
          }}
        >
          Export Logs
        </Button>
      </div>

      <Card>
        {/* Filter Toolbar */}
        <div className="p-3.5 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/40">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search logs by Actor, Event, or Details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          {/* Severity Pills */}
          <div className="flex items-center gap-1.5 w-full md:w-auto">
            {['ALL', 'INFO', 'WARN', 'CRITICAL'].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  severityFilter === s
                    ? 'bg-zinc-800 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-900/80'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Logs Table */}
        <Table>
          <TableHeader>
            <TableRow hover={false}>
              <TableHead>Timestamp</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>IP Origin</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Copy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((l) => (
              <TableRow key={l.id} className="font-mono text-xs">
                <TableCell className="text-zinc-400 whitespace-nowrap">
                  {l.timestamp}
                </TableCell>
                <TableCell>
                  {l.severity === 'INFO' && <Badge variant="info" size="sm">INFO</Badge>}
                  {l.severity === 'WARN' && <Badge variant="warning" size="sm">WARN</Badge>}
                  {l.severity === 'CRITICAL' && <Badge variant="destructive" size="sm">CRITICAL</Badge>}
                </TableCell>
                <TableCell className="font-semibold text-zinc-200">
                  {l.actor}
                </TableCell>
                <TableCell className="text-indigo-400 font-semibold">
                  {l.eventType}
                </TableCell>
                <TableCell className="text-zinc-400">
                  {l.ipAddress}
                </TableCell>
                <TableCell className="text-zinc-300 max-w-md truncate font-mono text-[11px]">
                  {l.details}
                </TableCell>
                <TableCell className="text-right">
                  <button
                    onClick={() => handleCopy(l.id, `${l.timestamp} [${l.severity}] ${l.actor} ${l.eventType}: ${l.details}`)}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100"
                    title="Copy Log Row"
                  >
                    {copiedId === l.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
