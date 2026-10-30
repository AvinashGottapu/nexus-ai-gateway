import asyncio
import time
import math
import random
from typing import List, Dict, Any
import httpx
from gateway.identity import create_api_key

# =====================================================================
# LAYER D: RELEASE + RECOVERY - LOAD TESTING HARNESS
# =====================================================================

BASE_URL = "http://127.0.0.1:8000"
CONCURRENT_USERS = 20       # Simulated simultaneous users
REQUESTS_PER_USER = 2       # Requests fired per user (Total = 40 requests)

# Diverse test prompt mix (Repeated queries test Semantic Cache; novel ones test Concurrency Semaphores)
PROMPT_POOL = [
    "What is the return policy for electronics?",  # Repeated for Cache Hit test
    "What is the return policy for electronics?",  # Repeated for Cache Hit test
    "Explain binary search tree complexity in one sentence.",
    "Show me running shoes with soft cushioning.",
    "How does distributed sliding window rate limiting work?",
    "What is the capital of France?",
    "Summarize the benefits of unit testing in software development."
]


class LoadTestResult:
    def __init__(
        self,
        status_code: int,
        latency_ms: float,
        cache_hit: bool = False,
        error: str = ""
    ):
        self.status_code = status_code
        self.latency_ms = latency_ms
        self.cache_hit = cache_hit
        self.error = error


async def simulate_user_request(
    client: httpx.AsyncClient,
    api_key: str,
    user_id: int,
    request_num: int
) -> LoadTestResult:
    """Simulates a single user sending an inference request to /chat."""
    prompt = random.choice(PROMPT_POOL)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "prompt": prompt,
        "provider": "groq",
        "session_id": f"sess_loadtest_user_{user_id}"
    }

    t0 = time.perf_counter()
    try:
        response = await client.post(
            f"{BASE_URL}/chat",
            json=payload,
            headers=headers,
            timeout=30.0
        )
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)

        cache_hit = False
        if response.status_code == 200:
            data = response.json()
            cache_info = data.get("cache", {})
            cache_hit = cache_info.get("hit", False)

        return LoadTestResult(
            status_code=response.status_code,
            latency_ms=latency_ms,
            cache_hit=cache_hit
        )
    except Exception as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return LoadTestResult(
            status_code=500,
            latency_ms=latency_ms,
            error=str(e)
        )


async def run_load_test():
    """
    Executes the concurrent load test suite:
    1. Generates an authorized LoadTest API key with starter credits.
    2. Spawns CONCURRENT_USERS async tasks simultaneously.
    3. Measures throughput (RPS), p95 latency, error rates, and cache hits.
    """
    print("\n" + "=" * 70)
    print(" 🚀 LAYER D: STARTING CONCURRENT LOAD & STRESS TEST")
    print(f" Target: {BASE_URL}")
    print(f" Concurrency: {CONCURRENT_USERS} simultaneous users")
    print(f" Total Requests: {CONCURRENT_USERS * REQUESTS_PER_USER}")
    print("=" * 70)

    # 1. Create a dedicated API key for load testing
    key_info = create_api_key(
        name="LoadTest-Runner",
        starter_credits=50.0,
        rpm_limit=500
    )
    raw_api_key = key_info["api_key"]
    print(f"🔑 Test API Key Generated: {raw_api_key[:12]}... (Balance: $50.00)")
    print("⚡ Firing concurrent requests into the gateway...\n")

    t_start = time.perf_counter()

    # 2. Fire simultaneous requests using high-performance AsyncClient
    limits = httpx.Limits(max_keepalive_connections=50, max_connections=100)
    async with httpx.AsyncClient(limits=limits) as client:
        tasks = []
        for user_id in range(CONCURRENT_USERS):
            for req_num in range(REQUESTS_PER_USER):
                tasks.append(simulate_user_request(client, raw_api_key, user_id, req_num))

        # Await all concurrent tasks in parallel
        results: List[LoadTestResult] = await asyncio.gather(*tasks)

    total_time_seconds = round(time.perf_counter() - t_start, 2)

    # 3. Analyze Telemetry & Performance Metrics
    total = len(results)
    successful = [r for r in results if r.status_code == 200]
    rate_limited = [r for r in results if r.status_code == 429]
    errors = [r for r in results if r.status_code not in [200, 429]]
    cache_hits = [r for r in results if r.cache_hit]

    latencies = sorted([r.latency_ms for r in successful])
    
    avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0.0
    min_latency = min(latencies) if latencies else 0.0
    max_latency = max(latencies) if latencies else 0.0

    # Calculate p95 Latency
    p95_latency = 0.0
    if latencies:
        p95_idx = math.ceil(0.95 * len(latencies)) - 1
        p95_idx = max(0, min(p95_idx, len(latencies) - 1))
        p95_latency = latencies[p95_idx]

    # Calculate Throughput (Requests Per Second)
    throughput_rps = round(total / max(0.01, total_time_seconds), 1)

    # 4. Render Structured Scorecard
    print("\n" + "=" * 70)
    print(" 📊 LOAD TEST PERFORMANCE SCORECARD")
    print("=" * 70)
    print(f" Total Requests Executed:    {total}")
    print(f" Total Duration:             {total_time_seconds} seconds")
    print(f" Throughput:                 {throughput_rps} requests/second (RPS)")
    print("-" * 70)
    print(f" ✅ Successful (200 OK):     {len(successful)} ({round(len(successful)/total*100, 1)}%)")
    print(f" ⚡ Cache Hits:              {len(cache_hits)} ({round(len(cache_hits)/total*100, 1)}%)")
    print(f" ⏳ Rate Limited (429):      {len(rate_limited)}")
    print(f" ❌ Server Errors (5xx):     {len(errors)}")
    print("-" * 70)
    print(f" ⏱️ Latency (Min):           {min_latency} ms")
    print(f" ⏱️ Latency (Avg):           {avg_latency} ms")
    print(f" ⏱️ Latency (p95):           {p95_latency} ms")
    print(f" ⏱️ Latency (Max):           {max_latency} ms")
    print("=" * 70)

    if len(successful) == total:
        print(" 🏆 VERDICT: EXCELLENT! 100% Reliability under heavy concurrent load.")
    elif len(errors) == 0:
        print(" 🟢 VERDICT: PASSED! Zero 500 server crashes. Rate limits & queueing functioned properly.")
    else:
        print(f" ⚠️ VERDICT: ATTENTION NEEDED. {len(errors)} requests suffered failures.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    asyncio.run(run_load_test())
