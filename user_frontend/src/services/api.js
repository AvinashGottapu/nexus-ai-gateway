const BACKEND_URL = 'http://localhost:8000';

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
    const provider = model.includes('gemini') ? 'gemini' : model.includes('openai') ? 'openai' : 'groq';

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
      signal: AbortSignal.timeout(15000)
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
    return {
      success: true,
      statusCode: 200,
      latencyMs: data.duration_ms || elapsed,
      data: {
        content: data.answer || data.response || JSON.stringify(data),
        tokens: data.tokens_used || data.total_tokens || 450,
        costUsd: data.cost_usd || 0.00012,
        isCacheHit: Boolean(data.cache_hit || (data.model_used === 'semantic_cache')),
        model: data.model_used || model,
        traceId: data.trace_id
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
