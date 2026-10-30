import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Zap,
  Clock,
  ArrowUpDown,
  Download
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table';
import { Modal } from '../ui/Modal';

export const RequestHistory = ({ requests }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [providerFilter, setProviderFilter] = useState('ALL');
  const [selectedRequest, setSelectedRequest] = useState(null);

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Search
      const matchesSearch =
        req.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.userPromptSnippet.toLowerCase().includes(searchQuery.toLowerCase());

      // Status Filter
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'SUCCESS' && req.statusCode === 200) ||
        (statusFilter === 'CACHE' && req.isCacheHit) ||
        (statusFilter === 'RATE_LIMIT' && req.statusCode === 429) ||
        (statusFilter === 'ERROR' && (req.statusCode === 400 || req.statusCode === 500));

      // Provider Filter
      const matchesProvider =
        providerFilter === 'ALL' || req.provider === providerFilter;

      return matchesSearch && matchesStatus && matchesProvider;
    });
  }, [requests, searchQuery, statusFilter, providerFilter]);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            My Request Invocations
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Audit logs for all outbound inferences, token consumption, and semantic cache transactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => {
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredRequests, null, 2));
              const downloadAnchor = document.createElement('a');
              downloadAnchor.setAttribute("href", dataStr);
              downloadAnchor.setAttribute("download", "nexus_gateway_requests.json");
              document.body.appendChild(downloadAnchor);
              downloadAnchor.click();
              downloadAnchor.remove();
            }}
          >
            Export JSON
          </Button>
        </div>
      </div>

      <Card>
        {/* Filter Controls Header */}
        <div className="p-3.5 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/40">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by Request ID, Model, or Prompt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">200 OK (All)</option>
              <option value="CACHE">⚡ Cache Hits Only</option>
              <option value="RATE_LIMIT">429 Rate Limited</option>
              <option value="ERROR">Errors (400 / 500)</option>
            </select>

            {/* Provider Filter */}
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Providers</option>
              <option value="Groq">Groq (gpt-oss-120b)</option>
              <option value="Gemini">Google Gemini</option>
              <option value="OpenAI">OpenAI</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow hover={false}>
              <TableHead>Request ID</TableHead>
              <TableHead>Model / Provider</TableHead>
              <TableHead>Prompt Snippet</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRequests.length === 0 ? (
              <TableRow hover={false}>
                <TableCell colSpan={8} className="text-center py-10 text-zinc-500">
                  No requests matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredRequests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    {req.id}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs text-zinc-900 dark:text-zinc-100">
                        {req.model}
                      </span>
                      {req.isCacheHit && (
                        <Badge variant="success" size="sm">
                          CACHE
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-zinc-600 dark:text-zinc-300">
                    {req.userPromptSnippet}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <span className={req.latencyMs < 100 ? 'text-emerald-500 font-semibold' : 'text-zinc-400'}>
                      {req.latencyMs} ms
                    </span>
                  </TableCell>
                  <TableCell>
                    {req.statusCode === 200 && <Badge variant="success" size="sm">200 OK</Badge>}
                    {req.statusCode === 429 && <Badge variant="warning" size="sm">429 RPM Exceeded</Badge>}
                    {req.statusCode === 400 && <Badge variant="destructive" size="sm">400 Guardrail</Badge>}
                    {req.statusCode === 500 && <Badge variant="destructive" size="sm">500 Provider Err</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {req.isCacheHit ? (
                      <span className="text-emerald-500 font-semibold">$0.0000</span>
                    ) : (
                      <span>${req.costUsd.toFixed(6)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                    {req.timestamp.split(' ')[1]}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRequest(req)}
                      icon={<Eye className="w-3.5 h-3.5" />}
                    >
                      Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Inspect Modal */}
      <Modal
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title={`Request Inspector — ${selectedRequest?.id}`}
        description="Detailed trace metrics and payload metadata"
        maxWidth="max-w-2xl"
      >
        {selectedRequest && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-400">Total Latency</span>
                <div className="text-sm font-bold font-mono text-emerald-500">{selectedRequest.latencyMs} ms</div>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-400">Status</span>
                <div className="text-sm font-bold font-mono text-indigo-400">{selectedRequest.statusCode}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-400">Tokens</span>
                <div className="text-sm font-bold font-mono text-zinc-200">{selectedRequest.tokens}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-400">Cost</span>
                <div className="text-sm font-bold font-mono text-amber-400">${selectedRequest.costUsd.toFixed(6)}</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-xs font-semibold text-zinc-400">User Prompt Payload</span>
              <p className="text-xs font-mono text-zinc-300 leading-relaxed bg-zinc-100 dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200/60 dark:border-zinc-800">
                {selectedRequest.userPromptSnippet}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-400">Multi-Layer Execution Path</span>
                <Badge variant={selectedRequest.isCacheHit ? 'success' : 'info'} size="sm">
                  {selectedRequest.isCacheHit ? 'Cached in Upstash Redis (0ms LLM)' : 'Model Gateway Cascade'}
                </Badge>
              </div>
              <div className="text-xs space-y-1 text-zinc-400 font-mono">
                <div>• Input Guardrails (PII Anonymization & Prompt Guard): PASSED</div>
                <div>• Semantic Cache Lookup: {selectedRequest.isCacheHit ? 'HIT (Similarity: 1.00)' : 'MISS (Forwarded)'}</div>
                <div>• Model Dispatch Provider: {selectedRequest.provider} ({selectedRequest.model})</div>
                <div>• Output Guardrails: PASSED</div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedRequest(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
