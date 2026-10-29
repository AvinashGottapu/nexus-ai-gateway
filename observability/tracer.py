import os
import time
import uuid
import math
from typing import Dict, Any, List, Optional
from gateway.identity import get_redis_client
from orchestrator.circuit_breaker import circuit_breaker

# =====================================================================
# LAYER D: 09 OBSERVABILITY (Traces • p95 Latency • Tokens • Cost)
# =====================================================================

def generate_trace_id() -> str:
    """Generates a unique distributed trace identifier for request tracking."""
    return f"tr_{uuid.uuid4().hex[:12]}"


class RequestTimer:
    """
    High-resolution timer for tracking exact millisecond latency across every pipeline phase:
    - input_guardrails_ms
    - cache_lookup_ms
    - orchestrator_llm_ms
    - output_guardrails_ms
    - total_latency_ms
    """
    def __init__(self):
        self.start_time = time.perf_counter()
        self.phase_times: Dict[str, float] = {}
        self._current_phase_start = self.start_time

    def start_phase(self):
        """Starts timing a specific sub-phase."""
        self._current_phase_start = time.perf_counter()

    def record_phase(self, phase_name: str) -> float:
        """Records duration of the phase in milliseconds."""
        duration_ms = round((time.perf_counter() - self._current_phase_start) * 1000, 2)
        self.phase_times[phase_name] = duration_ms
        self._current_phase_start = time.perf_counter()
        return duration_ms

    def get_summary(self) -> Dict[str, float]:
        """Returns all phase durations plus total end-to-end request latency."""
        total_ms = round((time.perf_counter() - self.start_time) * 1000, 2)
        summary = dict(self.phase_times)
        summary["total_latency_ms"] = total_ms
        return summary


# --- 2. ASYNC REDIS METRICS COLLECTOR ---

async def record_request_metrics(
    provider: str,
    cache_hit: bool,
    total_tokens: int,
    cost_usd: float,
    latency_ms: float
) -> None:
    """
    Records real-time telemetry metrics into Redis using atomic async pipeline:
    - Increments request counts, cache hits, token usage, and cumulative spend.
    - Stores latency in a rolling sorted set to calculate accurate p95 & average latency.
    """
    r = await get_redis_client()
    if not r:
        return

    now = time.time()
    try:
        pipe = r.pipeline()

        # 1. Atomic counters
        pipe.incr("metrics:total_requests")
        if cache_hit:
            pipe.incr("metrics:cache_hits")
        if total_tokens > 0:
            pipe.incrby("metrics:total_tokens", total_tokens)
        if cost_usd > 0:
            pipe.incrbyfloat("metrics:total_cost_usd", cost_usd)
        
        # 2. Provider breakdown
        pipe.incr(f"metrics:provider:{provider.lower()}")

        # 3. Rolling latency window (1 hour retention) for p95 calculation
        # Member stores "latency_ms:unique_id", Score is timestamp (now)
        latency_member = f"{latency_ms}:{uuid.uuid4().hex[:6]}"
        pipe.zadd("metrics:latencies", {latency_member: now})
        # Safely drop entries older than 3600 seconds (now - 3600)
        pipe.zremrangebyscore("metrics:latencies", 0, now - 3600)

        await pipe.execute()
    except Exception as e:
        print(f"⚠️ Metrics recording error ({e})")


async def get_gateway_metrics() -> Dict[str, Any]:
    """
    Aggregates live platform health metrics from Redis asynchronously:
    - Total requests, cache hit ratio
    - p95 and average response latency
    - Total tokens consumed & total money spent
    - Provider usage distribution
    """
    r = await get_redis_client()
    if not r:
        return {
            "status": "degraded",
            "message": "Redis metrics collector unavailable"
        }

    try:
        total_requests = int(await r.get("metrics:total_requests") or 0)
        cache_hits = int(await r.get("metrics:cache_hits") or 0)
        total_tokens = int(await r.get("metrics:total_tokens") or 0)
        total_cost = float(await r.get("metrics:total_cost_usd") or 0.0)

        # Provider distribution
        groq_requests = int(await r.get("metrics:provider:groq") or 0)
        gemini_requests = int(await r.get("metrics:provider:gemini") or 0)
        openai_requests = int(await r.get("metrics:provider:openai") or 0)

        # Calculate Cache Hit Ratio
        hit_ratio = "0.0%"
        if total_requests > 0:
            ratio_val = (cache_hits / total_requests) * 100
            hit_ratio = f"{round(ratio_val, 1)}%"

        # Calculate Average and p95 Latency from Redis sorted set
        # Score is timestamp; member is "latency_ms:unique_id"
        raw_latencies = await r.zrange("metrics:latencies", 0, -1)
        
        avg_latency_ms = 0.0
        p95_latency_ms = 0.0

        if raw_latencies:
            scores = []
            for item in raw_latencies:
                try:
                    val = float(item.split(":")[0])
                    scores.append(val)
                except Exception:
                    continue

            if scores:
                scores.sort()
                avg_latency_ms = round(sum(scores) / len(scores), 2)
                
                # Compute 95th percentile
                p95_index = math.ceil(0.95 * len(scores)) - 1
                p95_index = max(0, min(p95_index, len(scores) - 1))
                p95_latency_ms = round(scores[p95_index], 2)

        return {
            "status": "healthy",
            "layer": "09 Production Operations (Observability)",
            "total_requests": total_requests,
            "cache_hit_ratio": hit_ratio,
            "cache_hits": cache_hits,
            "latency": {
                "avg_ms": avg_latency_ms,
                "p95_ms": p95_latency_ms,
                "sample_size": len(raw_latencies)
            },
            "consumption": {
                "total_tokens": total_tokens,
                "total_spend_usd": round(total_cost, 6)
            },
            "provider_distribution": {
                "groq": groq_requests,
                "gemini": gemini_requests,
                "openai": openai_requests
            },
            "circuit_breakers": circuit_breaker.get_status()
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error compiling gateway metrics: {str(e)}"
        }
