import os
import time
import uuid
import math
import json
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
    latency_ms: float,
    saved_cost_usd: float = 0.0,
    phase_timings: Optional[Dict[str, float]] = None
) -> None:
    """
    Records real-time telemetry metrics into Redis using atomic async pipeline:
    - Increments request counts, cache hits, token usage, and cumulative spend.
    - Tracks avoided cost on cache hits (metrics:saved_cost_usd).
    - Records phase timings for live waterfall observability.
    - Stores latency in a rolling sorted set to calculate accurate p50, p95 & p99 latency.
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
            if saved_cost_usd > 0:
                pipe.incrbyfloat("metrics:saved_cost_usd", saved_cost_usd)
        if total_tokens > 0:
            pipe.incrby("metrics:total_tokens", total_tokens)
        if cost_usd > 0:
            pipe.incrbyfloat("metrics:total_cost_usd", cost_usd)
        
        # 2. Provider breakdown
        pipe.incr(f"metrics:provider:{provider.lower()}")

        # 3. Rolling 1-hour Phase Timings Window (3600 seconds)
        if phase_timings:
            clean_phases = {k: round(float(v), 2) for k, v in phase_timings.items() if isinstance(v, (int, float)) and v >= 0}
            if clean_phases:
                phase_entry = json.dumps({
                    "id": uuid.uuid4().hex[:6],
                    "t": now,
                    "data": clean_phases
                })
                pipe.zadd("metrics:phases_rolling", {phase_entry: now})
                # Evict entries older than 1 hour (3600s)
                pipe.zremrangebyscore("metrics:phases_rolling", 0, now - 3600)

        # 4. Rolling latency window (1 hour retention) for p50/p95/p99 calculation
        # Member stores "latency_ms:unique_id", Score is timestamp (now)
        latency_member = f"{latency_ms}:{uuid.uuid4().hex[:6]}"
        pipe.zadd("metrics:latencies", {latency_member: now})
        # Safely drop entries older than 3600 seconds (now - 3600)
        pipe.zremrangebyscore("metrics:latencies", 0, now - 3600)

        if hasattr(pipe, "exec"):
            await pipe.exec()
        else:
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
        saved_cost = float(await r.get("metrics:saved_cost_usd") or 0.0)

        # Fallback estimation for existing historical cache hits if saved_cost was not recorded yet
        if saved_cost == 0.0 and cache_hits > 0:
            avg_call_cost = (total_cost / max(total_requests - cache_hits, 1)) if (total_requests > cache_hits and total_cost > 0) else 0.0006
            saved_cost = round(cache_hits * avg_call_cost, 6)

        # Provider distribution
        groq_requests = int(await r.get("metrics:provider:groq") or 0)
        gemini_requests = int(await r.get("metrics:provider:gemini") or 0)
        openai_requests = int(await r.get("metrics:provider:openai") or 0)

        # Calculate Cache Hit Ratio
        hit_ratio = "0.0%"
        if total_requests > 0:
            ratio_val = (cache_hits / total_requests) * 100
            hit_ratio = f"{round(ratio_val, 1)}%"

        now = time.time()
        one_hour_ago = now - 3600

        # Proactively evict records older than 1 hour on metrics read
        try:
            await r.zremrangebyscore("metrics:latencies", 0, one_hour_ago)
            await r.zremrangebyscore("metrics:phases_rolling", 0, one_hour_ago)
        except Exception as e:
            print(f"⚠️ Error evicting expired metrics: {e}")

        # Calculate Average, P50, P95, and P99 Latency strictly from the rolling 1-hour window
        # Score is timestamp; member is "latency_ms:unique_id"
        raw_latencies = await r.zrangebyscore("metrics:latencies", one_hour_ago, "+inf")
        
        avg_latency_ms = None
        p50_latency_ms = None
        p95_latency_ms = None
        p99_latency_ms = None

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
                avg_latency_ms = round(sum(scores) / len(scores), 1)
                
                # Compute 50th percentile (Median)
                p50_index = max(0, min(math.ceil(0.50 * len(scores)) - 1, len(scores) - 1))
                p50_latency_ms = round(scores[p50_index], 1)

                # Compute 95th percentile
                p95_index = max(0, min(math.ceil(0.95 * len(scores)) - 1, len(scores) - 1))
                p95_latency_ms = round(scores[p95_index], 1)

                # Compute 99th percentile (Worst-case)
                p99_index = max(0, min(math.ceil(0.99 * len(scores)) - 1, len(scores) - 1))
                p99_latency_ms = round(scores[p99_index], 1)

        ratio_num = round(ratio_val, 1) if total_requests > 0 else 0.0

        # Query rolling 1-hour phase breakdown records strictly within the 3600s window
        raw_phase_records = await r.zrangebyscore("metrics:phases_rolling", one_hour_ago, "+inf")
        
        phase_sums: Dict[str, float] = {}
        phase_counts: Dict[str, int] = {}

        if raw_phase_records:
            for item_str in raw_phase_records:
                try:
                    parsed = json.loads(item_str)
                    p_data = parsed.get("data", {})
                    for k, val in p_data.items():
                        phase_sums[k] = phase_sums.get(k, 0.0) + float(val)
                        phase_counts[k] = phase_counts.get(k, 0) + 1
                except Exception:
                    continue

        phase_config = [
            ("input_guardrails_ms", "01. Input Guardrails (Presidio PII + Prompt Guard)", "bg-indigo-500"),
            ("auth_ms", "02. Identity & Rate Limit (Upstash Redis REST)", "bg-blue-500"),
            ("cache_lookup_ms", "03. Semantic Cosine Cache Lookup (Gemini Embedding)", "bg-emerald-500"),
            ("intent_routing_ms", "04. Router Intent Classification (Groq gpt-oss-120b)", "bg-amber-500"),
            ("orchestrator_llm_ms", "05. Model Gateway Inference & Streaming", "bg-purple-500"),
            ("output_guardrails_ms", "06. Output Guardrails (Secret Redaction & Verification)", "bg-rose-500")
        ]

        waterfall_phases = []
        total_phase_sum = 0.0

        for key, label, color in phase_config:
            if key in phase_counts and phase_counts[key] > 0:
                calc_ms = round(phase_sums[key] / phase_counts[key], 1)
                total_phase_sum += calc_ms
                waterfall_phases.append({
                    "phase": label,
                    "key": key,
                    "ms": calc_ms,
                    "color": color,
                    "has_live_data": True
                })
            else:
                waterfall_phases.append({
                    "phase": label,
                    "key": key,
                    "ms": None,
                    "color": color,
                    "has_live_data": False
                })

        for p in waterfall_phases:
            if p["has_live_data"] and total_phase_sum > 0:
                p["pct"] = max(1, round((p["ms"] / total_phase_sum) * 100))
            else:
                p["pct"] = 0

        # Retrieve real provider concurrency semaphores
        try:
            from orchestrator.model_gateway import get_semaphore_status
            semaphores = get_semaphore_status()
        except Exception:
            semaphores = {
                "groq": {"active": 0, "cap": 15},
                "gemini": {"active": 0, "cap": 15},
                "openai": {"active": 0, "cap": 20}
            }

        return {
            "status": "healthy",
            "layer": "09 Production Operations (Observability)",
            "total_requests": total_requests,
            "cache_hit_ratio": hit_ratio,
            "cache_hit_ratio_percent": ratio_num,
            "cache_hits": cache_hits,
            "p50_latency_ms": p50_latency_ms,
            "p95_latency_ms": p95_latency_ms,
            "p99_latency_ms": p99_latency_ms,
            "avg_latency_ms": avg_latency_ms,
            "total_tokens": total_tokens,
            "total_spend_usd": round(total_cost, 6),
            "saved_cost_usd": round(saved_cost, 6),
            "phases": waterfall_phases,
            "semaphores": semaphores,
            "latency": {
                "avg_ms": avg_latency_ms,
                "p50_ms": p50_latency_ms,
                "p95_ms": p95_latency_ms,
                "p99_ms": p99_latency_ms,
                "sample_size": len(raw_latencies)
            },
            "consumption": {
                "total_tokens": total_tokens,
                "total_spend_usd": round(total_cost, 6),
                "saved_cost_usd": round(saved_cost, 6)
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
