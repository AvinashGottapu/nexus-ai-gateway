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
    const res = await fetch(`${BACKEND_URL}/v1/hitl/tickets/pending`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, data };
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
