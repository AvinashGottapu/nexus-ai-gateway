const BACKEND_URL = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8000'
  : 'http://localhost:8000';

export async function getLiveApiKeys() {
  try {
    const res = await fetch(`${BACKEND_URL}/v1/keys`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
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
      return {
        success: false,
        statusCode: res.status,
        latencyMs: elapsed,
        error: errJson.detail || errJson.message || `Error ${res.status}`
      };
    }

    const data = await res.json();
    const totalTokens = data.token_usage
      ? (data.token_usage.prompt_tokens || 0) + (data.token_usage.completion_tokens || 0)
      : (data.tokens_used || data.total_tokens || 450);
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


