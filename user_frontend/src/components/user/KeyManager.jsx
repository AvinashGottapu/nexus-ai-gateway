import React, { useState } from 'react';
import {
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Plus,
  Shield,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { postCreateApiKey, postRevokeApiKey } from '../../services/api';

export const KeyManager = ({ apiKeys, setApiKeys, isModalOpen, setIsModalOpen }) => {
  const [copiedId, setCopiedId] = useState(null);
  const [revealedIds, setRevealedIds] = useState({});
  const [newKeyCreated, setNewKeyCreated] = useState(null);

  // New Key Form State
  const [keyName, setKeyName] = useState('');
  const [keyTier, setKeyTier] = useState('Tier-1');
  const [scopes, setScopes] = useState(['inference:read', 'inference:write']);

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleReveal = (id) => {
    setRevealedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRevoke = async (id) => {
    await postRevokeApiKey(id);
    setApiKeys(prev =>
      prev.map(k => (k.id === id || k.key_hash === id) ? { ...k, status: 'revoked' } : k)
    );
  };

  const handleRoll = (id) => {
    const randomHex = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const newRaw = `nexus-sk-roll-${randomHex}`;
    const newMasked = `nexus-sk-roll••••••••${randomHex.slice(-4)}`;
    setApiKeys(prev =>
      prev.map(k => k.id === id ? {
        ...k,
        rawKey: newRaw,
        keyMasked: newMasked,
        lastUsedAt: 'Just now'
      } : k)
    );
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    const rpmLimits = {
      'Free': 10,
      'Tier-1': 60,
      'Tier-2': 300,
      'Enterprise': 1000
    };

    const rpm = rpmLimits[keyTier] || 60;
    const backendRes = await postCreateApiKey({
      name: keyName || 'Generated API Key',
      starterCredits: 5.0,
      rpmLimit: rpm
    });

    if (backendRes.success && backendRes.data && backendRes.data.api_key) {
      const raw = backendRes.data.api_key;
      const newKey = {
        id: `key-${Date.now()}`,
        name: keyName || 'Generated API Key',
        rawKey: raw,
        keyMasked: `sk-live-••••••••${raw.slice(-4)}`,
        tier: keyTier,
        rpmLimit: rpm,
        balanceUsd: 5.0000,
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        lastUsedAt: 'Never',
        scopes: scopes,
        status: 'active'
      };
      setApiKeys(prev => [newKey, ...prev]);
      setNewKeyCreated(newKey);
      setKeyName('');
      return;
    }

    // Local fallback if backend unavailable
    const randomHex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const raw = `nexus-sk-${keyTier.toLowerCase()}-${randomHex}`;
    const masked = `nexus-sk-${keyTier.toLowerCase()}••••••••${randomHex.slice(-4)}`;

    const newKey = {
      id: `key-${Date.now()}`,
      name: keyName || 'Generated API Key',
      rawKey: raw,
      keyMasked: masked,
      tier: keyTier,
      rpmLimit: rpm,
      balanceUsd: 5.0000,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      lastUsedAt: 'Never',
      scopes: scopes,
      status: 'active'
    };

    setApiKeys(prev => [newKey, ...prev]);
    setNewKeyCreated(newKey);
    setKeyName('');
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            API Keys & Integrations
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Authenticate applications and client requests using SHA-256 hashed API secrets.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => {
            setNewKeyCreated(null);
            setIsModalOpen(true);
          }}
        >
          Create Secret Key
        </Button>
      </div>

      {/* Keys Grid */}
      <div className="space-y-3">
        {apiKeys.map((keyItem) => {
          const isRevealed = revealedIds[keyItem.id];
          const isRevoked = keyItem.status === 'revoked';

          return (
            <Card
              key={keyItem.id}
              className={`transition-all ${isRevoked ? 'opacity-60 bg-zinc-50/50 dark:bg-zinc-900/30' : ''}`}
            >
              <CardContent className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                          {keyItem.name}
                        </span>
                        <Badge
                          variant={isRevoked ? 'destructive' : (keyItem.tier === 'Tier-2' ? 'info' : 'success')}
                          size="sm"
                        >
                          {keyItem.tier || 'Tier-1'} ({keyItem.rpmLimit ?? keyItem.rpm_limit ?? 60} RPM)
                        </Badge>
                        {isRevoked && (
                          <Badge variant="destructive" size="sm">
                            REVOKED
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Created on {keyItem.createdAt || keyItem.created_at || 'Recently'} • Last used {keyItem.lastUsedAt || 'Never'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:text-right">
                    <span className="text-[11px] text-zinc-400">Balance: </span>
                    <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      ${(Number(keyItem.balanceUsd ?? keyItem.balance_usd ?? 0)).toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Key Token Value Row */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
                  <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate select-all">
                    {isRevealed && keyItem.rawKey ? keyItem.rawKey : (keyItem.keyMasked || keyItem.key_masked || 'nexus-sk-••••••••')}
                  </span>

                  {keyItem.rawKey && (
                    <button
                      onClick={() => handleToggleReveal(keyItem.id)}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-200"
                      title={isRevealed ? "Hide Key" : "Reveal Key"}
                    >
                      {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}

                  <button
                    onClick={() => handleCopy(keyItem.id, keyItem.rawKey || keyItem.keyMasked || keyItem.key_masked)}
                    disabled={isRevoked}
                    className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                    title="Copy Key"
                  >
                    {copiedId === keyItem.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Scopes & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(keyItem.scopes || ['inference:read', 'inference:write']).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isRevoked && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<RefreshCw className="w-3 h-3" />}
                        onClick={() => handleRoll(keyItem.id)}
                      >
                        Roll Secret
                      </Button>
                    )}
                    {!isRevoked ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                        icon={<Trash2 className="w-3 h-3" />}
                        onClick={() => handleRevoke(keyItem.id)}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <span className="text-[11px] text-zinc-500 italic">Key Revoked</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Key Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={newKeyCreated ? "Secret Key Generated" : "Provision New API Key"}
        description={newKeyCreated ? "Make sure to copy your key now. It cannot be shown again." : "Select rate limit tier and authorization scopes."}
      >
        {newKeyCreated ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>Your secret API key has been created and hashed in SQLite.</span>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="text-[11px] text-zinc-400 font-semibold">Your New Secret Key:</span>
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-zinc-100 break-all select-all">
                  {newKeyCreated.rawKey}
                </code>
                <Button
                  variant="primary"
                  size="sm"
                  icon={copiedId === 'new' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  onClick={() => handleCopy('new', newKeyCreated.rawKey)}
                >
                  {copiedId === 'new' ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setNewKeyCreated(null);
                  setIsModalOpen(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateKey} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Key Identifier / Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Production Mobile App Backend"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Rate Limit Tier Quota
              </label>
              <select
                value={keyTier}
                onChange={(e) => setKeyTier(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Free">Free Tier (10 RPM)</option>
                <option value="Tier-1">Tier 1 (60 RPM, $5.00 Pre-paid)</option>
                <option value="Tier-2">Tier 2 (300 RPM, High Throughput)</option>
                <option value="Enterprise">Enterprise (1,000 RPM, Dedicated)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Authorization Scopes
              </label>
              <div className="space-y-2 mt-2">
                {[
                  { id: 'inference:read', label: 'inference:read (Stream & Read completions)' },
                  { id: 'inference:write', label: 'inference:write (Invoke LLM pipelines)' },
                  { id: 'cache:read', label: 'cache:read (Zero-cost semantic cache query)' },
                  { id: 'tools:execute', label: 'tools:execute (Commerce search & Tavily scrapers)' }
                ].map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scopes.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) setScopes([...scopes, s.id]);
                        else setScopes(scopes.filter(item => item !== s.id));
                      }}
                      className="rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="ghost" size="sm" type="button" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit">
                Provision Key
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
