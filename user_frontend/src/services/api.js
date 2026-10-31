const BACKEND_URL = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8000'
  : 'http://localhost:8000';

export async function getLiveApiKeys() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/keys`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const mapped = (data || []).map(k => {
      const balance = Number(k.balance_usd ?? k.balanceUsd ?? 5.0);
      return {
        id: k.id || (k.key_hash ? k.key_hash.slice(0, 12) : `key-${Math.random().toString(36).substring(7)}`),
        name: k.name || 'API Key',
        key_hash: k.key_hash,
        keyMasked: k.key_masked || k.keyMasked || (k.key_prefix ? `${k.key_prefix}••••••••${(k.key_hash || '').slice(-4)}` : 'sk-live-••••••••'),
        rawKey: k.raw_key || k.rawKey || null,
        tier: k.tier || (k.rpm_limit > 100 ? 'Tier-2' : (k.rpm_limit > 10 ? 'Tier-1' : 'Free')),
        rpmLimit: k.rpm_limit ?? k.rpmLimit ?? 60,
        balanceUsd: balance,
        balance_usd: balance,
        createdAt: k.created_at || k.createdAt || '2026-10-15 08:30:00',
        lastUsedAt: k.last_used_at || k.lastUsedAt || 'Recently',
        scopes: Array.isArray(k.scopes) && k.scopes.length > 0 ? k.scopes : ['inference:read', 'inference:write', 'cache:read'],
        status: k.status || (k.is_active ? 'active' : 'revoked')
      };
    });
    return { success: true, data: mapped };
  } catch (err) {
    console.warn("Backend /v1/keys offline, using local cache:", err.message);
    return { success: false, error: err.message };
  }
}

export async function postCreateApiKey({ name, starterCredits = 5.0, rpmLimit = 60 }) {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/keys/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        starter_credits: starterCredits,
        rpm_limit: rpmLimit
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}



export async function postRevokeApiKey(keyId) {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/keys/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key_id: keyId }),
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function runLiveInference({ prompt, apiKey, model = 'groq' }) {
  const startTime = performance.now();
  try {
    let provider = 'groq';
    if (model.includes('gpt-oss') || model.includes('groq') || model.includes('llama')) {
      provider = 'groq';
    } else if (model.includes('gemini')) {
      provider = 'gemini';
    } else if (model.includes('gpt-4') || model === 'openai') {
      provider = 'openai';
    }

    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt,
        provider
      }),
      signal: AbortSignal.timeout(45000)
    });

    const elapsed = Math.round(performance.now() - startTime);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      const errorMsg = (typeof errJson.detail === 'object' && errJson.detail !== null)
        ? (errJson.detail.message || errJson.detail.error || JSON.stringify(errJson.detail))
        : (errJson.detail || errJson.message || `HTTP ${res.status}`);
      return {
        success: false,
        statusCode: res.status,
        latencyMs: elapsed,
        error: errorMsg
      };
    }

    const data = await res.json();
    const promptTokens = data.token_usage?.prompt_tokens ?? data.prompt_tokens ?? 0;
    const completionTokens = data.token_usage?.completion_tokens ?? data.completion_tokens ?? 0;
    const totalTokens = (promptTokens + completionTokens) > 0
      ? (promptTokens + completionTokens)
      : (data.token_usage?.total_tokens || data.tokens_used || data.total_tokens || 450);
    const latency = Math.round(data.timings_ms?.total_latency_ms || data.duration_ms || elapsed);
    const cost = data.billing?.cost_usd !== undefined ? data.billing.cost_usd : (data.cost_usd || 0.00012);
    const isHit = Boolean(data.cache?.hit || data.cache_hit || (data.model_used === 'semantic_cache'));

    return {
      success: true,
      statusCode: 200,
      latencyMs: latency,
      data: {
        content: data.response || data.answer || JSON.stringify(data),
        tokens: totalTokens,
        promptTokens: promptTokens,
        completionTokens: completionTokens,
        latencyMs: latency,
        costUsd: cost,
        isCacheHit: isHit,
        model: data.provider || data.model_used || model,
        traceId: data.trace_id,
        newBalanceUsd: data.billing?.remaining_balance_usd
      }
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    return {
      success: false,
      statusCode: 500,
      latencyMs: elapsed,
      error: err.message
    };
  }
}

// --- FEATURE 2: REAL-TIME SSE TOKEN STREAMING ---

export async function runLiveStreamingInference({
  prompt,
  apiKey,
  model = 'groq',
  onToken,
  onFirstToken,
  onComplete,
  onError
}) {
  const startTime = performance.now();
  let provider = 'groq';
  if (model.includes('gpt-oss') || model.includes('groq') || model.includes('llama')) {
    provider = 'groq';
  } else if (model.includes('gemini')) {
    provider = 'gemini';
  } else if (model.includes('gpt-4') || model === 'openai') {
    provider = 'openai';
  }

  try {
    const res = await fetch(`${BACKEND_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ prompt, provider }),
      signal: AbortSignal.timeout(60000)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      const errorMsg = (typeof errJson.detail === 'object' && errJson.detail !== null)
        ? (errJson.detail.message || errJson.detail.error || JSON.stringify(errJson.detail))
        : (errJson.detail || errJson.message || `HTTP ${res.status}`);
      if (onError) onError(errorMsg, res.status);
      return { success: false, error: errorMsg, statusCode: res.status };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedText = '';
    let firstTokenReported = false;
    let finalMetadata = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);

            if (!firstTokenReported && data.ttft_ms) {
              firstTokenReported = true;
              if (onFirstToken) onFirstToken(data.ttft_ms);
            }

            if (data.token) {
              accumulatedText += data.token;
              if (onToken) onToken(data.token, accumulatedText, data);
            }

            if (data.done) {
              finalMetadata = data;
            }
          } catch (e) {
            // Partial chunk
          }
        }
      }
    }

    const totalElapsed = Math.round(performance.now() - startTime);
    const summary = {
      content: accumulatedText,
      latencyMs: finalMetadata?.total_latency_ms || totalElapsed,
      ttftMs: finalMetadata?.ttft_ms || 0,
      tokens: finalMetadata?.total_tokens || Math.max(1, Math.round(accumulatedText.length / 4)),
      costUsd: finalMetadata?.cost_usd || 0.0001,
      isCacheHit: Boolean(finalMetadata?.cache_hit),
      providerUsed: finalMetadata?.provider || provider,
      traceId: finalMetadata?.trace_id || null,
      failoverTriggered: Boolean(finalMetadata?.failover_triggered)
    };

    if (onComplete) onComplete(summary);
    return { success: true, data: summary };
  } catch (err) {
    if (onError) onError(err.message);
    return { success: false, error: err.message };
  }
}


export async function getLiveTelemetry() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/observability/metrics`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}



// --- PAYMENTS & STRIPE API ---

export async function getLivePayments(userEmail) {
  try {
    const url = userEmail ? `${BACKEND_URL}/v1/payments?user_email=${encodeURIComponent(userEmail)}` : `${BACKEND_URL}/v1/payments`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function postStripeCheckout({ userEmail, amountUsd, cardNumber, paymentMethod, outcome = 'succeeded', failureReason }) {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/payments/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_email: userEmail,
        amount_usd: amountUsd,
        card_number: cardNumber,
        payment_method: paymentMethod || 'Stripe Card Payment',
        outcome: outcome,
        failure_reason: failureReason
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      return { success: false, error: err.detail || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- SECURITY & PII POLICY CONFIG ---

export async function getSecurityConfig() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/security/config`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function postSecurityConfig(config) {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/security/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}


