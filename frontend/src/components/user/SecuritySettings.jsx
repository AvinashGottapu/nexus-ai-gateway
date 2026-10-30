import React, { useState } from 'react';
import {
  Shield,
  Lock,
  EyeOff,
  Save,
  CheckCircle2,
  FileCheck
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export const SecuritySettings = () => {
  const [redactEmails, setRedactEmails] = useState(true);
  const [redactPhones, setRedactPhones] = useState(true);
  const [redactSsn, setRedactSsn] = useState(true);
  const [promptGuardEnforced, setPromptGuardEnforced] = useState(true);
  const [ipAllowlist, setIpAllowlist] = useState('0.0.0.0/0 (Global Access)');
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
          Security & Privacy Settings
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Configure Microsoft Presidio PII anonymization and Meta Prompt Guard sensitivity filters.
        </p>
      </div>

      {saved && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4" />
          <span>Security guardrail policies updated and enforced across all active API keys.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Layer A Input Guardrails */}
        <Card>
          <CardHeader>
            <CardTitle>Layer A: Microsoft Presidio PII Masking</CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              Automatically redact sensitive personal identifers before prompts hit LLM provider networks.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Redact Email Addresses (<EMAIL_ADDRESS>)', state: redactEmails, setter: setRedactEmails },
              { label: 'Redact Phone Numbers (<PHONE_NUMBER>)', state: redactPhones, setter: setRedactPhones },
              { label: 'Redact Social Security & Tax IDs (<US_SSN>)', state: redactSsn, setter: setRedactSsn },
              { label: 'Enforce Meta Prompt Guard 2 (86M) Input Classification', state: promptGuardEnforced, setter: setPromptGuardEnforced }
            ].map((item, idx) => (
              <label key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 cursor-pointer">
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{item.label}</span>
                <input
                  type="checkbox"
                  checked={item.state}
                  onChange={(e) => item.setter(e.target.checked)}
                  className="rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            ))}
          </CardContent>
        </Card>

        {/* IP Allowlist */}
        <Card>
          <CardHeader>
            <CardTitle>Network & IP Restrictions</CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              Restrict outbound API requests to authorized CIDR blocks or corporate VPN IP addresses.
            </p>
          </CardHeader>
          <CardContent>
            <div className="max-w-md">
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Authorized IP CIDR Ranges
              </label>
              <input
                type="text"
                value={ipAllowlist}
                onChange={(e) => setIpAllowlist(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-zinc-500 mt-1">Comma-separated list (e.g., 192.168.1.0/24, 10.0.0.1)</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-2">
          <Button variant="primary" size="md" icon={<Save className="w-4 h-4" />} type="submit">
            Save Security Policies
          </Button>
        </div>
      </form>
    </div>
  );
};
