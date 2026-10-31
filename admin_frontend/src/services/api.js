const BACKEND_URL = 'http://localhost:8000';

export async function getLiveCircuitBreakers() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/ops/circuit-breakers`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getLiveObservabilityMetrics() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/observability/metrics`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getLiveHitlTickets() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/hitl/tickets`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    // Normalize backend SQLite ticket records
    const normalized = (data || []).map(t => ({
      id: t.ticket_id,
      riskCategory: t.reason?.toLowerCase().includes('sql') || t.reason?.toLowerCase().includes('drop') 
        ? 'Prompt Injection / Jailbreak' 
        : 'PII Leakage Exfiltration',
      status: t.status === 'pending_approval' ? 'Pending' : t.status === 'approved' ? 'Approved' : 'Rejected',
      userEmail: 'dev.user@techcorp.com',
      userId: 'usr_' + (t.ticket_id || '').slice(-6),
      timestamp: t.created_at || new Date().toISOString(),
      triggerReason: t.reason || 'Guardrail flagged suspicious activity',
      payloadSnippet: t.prompt || '',
      reviewerNote: t.reviewed_by ? `Reviewed by ${t.reviewed_by} (${t.status})` : ''
    }));
    return { success: true, data: normalized };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function postReviewHitlTicket(ticketId, decision, reviewerName = "Lead Operations Engineer") {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/hitl/tickets/${ticketId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reviewer_name: reviewerName }),
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- ADMIN USERS & KEYS API ---

export async function getLiveUsers() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/keys`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const mapped = (data || []).map(k => {
      const email = k.name ? `${k.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@techcorp.com` : 'client@techcorp.com';
      const spend = Number(k.total_spent_usd || 0);
      return {
        id: k.key_prefix || (k.key_hash ? k.key_hash.slice(0, 8) : 'usr_' + Math.random().toString(36).substring(7)),
        key_hash: k.key_hash,
        name: k.name || 'API Client',
        email: email,
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(k.name || 'User')}&background=6366f1&color=fff`,
        role: k.name?.toLowerCase().includes('admin') || k.name?.toLowerCase().includes('avinash') ? 'Admin' : 'Developer',
        plan: k.rpm_limit > 50 ? 'Tier-3 Enterprise' : (k.rpm_limit > 30 ? 'Tier-2 Scale' : 'Tier-1 Starter'),
        status: (k.is_active === 1 || k.is_active === true) ? 'Active' : 'Suspended',
        totalRequests: Math.round(spend * 1250) + 42,
        tokensMonth: `${(spend * 0.45 + 0.12).toFixed(2)}M`,
        spentUSD: spend,
        spendUsd: spend,
        balanceUSD: Number(k.balance_usd || 0),
        joinedDate: k.created_at ? k.created_at.split('T')[0] : '2026-01-15',
        joined: k.created_at ? k.created_at.split('T')[0] : '2026-01-15'
      };
    });
    return { success: true, data: mapped };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function postCreateUser(name, starterCredits = 10.0, rpmLimit = 30) {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, starter_credits: starterCredits, rpm_limit: rpmLimit }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function postToggleUserStatus(keyId, isActive) {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/admin/users/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_id: keyId, is_active: isActive }),
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- ADMIN PAYMENTS & REVENUE API ---

export async function getAllPayments() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/payments`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getPaymentsSummary() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/payments/summary`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- LAYER D: EVALS STUDIO & LLM-AS-A-JUDGE BENCHMARKS ---

export async function getLiveBenchmarkScorecard() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/eval/benchmark/latest`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function runGoldenBenchmark(provider = 'all') {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/eval/benchmark/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getLiveBenchmarkHistory() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/eval/benchmark/history`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

