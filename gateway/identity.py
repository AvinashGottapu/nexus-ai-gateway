import os
import sys
import time
import sqlite3
import hashlib
import secrets
from typing import Optional, Dict, Any
from dotenv import load_dotenv
import redis.asyncio as aioredis
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Ensure Windows stdout safely prints UTF-8 logs and warning symbols
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv()

DB_PATH = os.path.join(os.path.dirname(__file__), "gateway.db")
# __file__ =>   A special Python variable that holds the full file path of the current script.
# os.path.dirname(__file__) => Gets the folder that contains this file.

UPSTASH_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL")
UPSTASH_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN")
REDIS_URL = os.getenv("REDIS_URL")

# Unified Async Redis client (Supports Upstash REST over HTTPS port 443 + native TCP fallback)
_redis_client: Any = None

security = HTTPBearer(auto_error=False)


async def get_redis_client():
    """
    Returns a singleton async Redis connection:
    - Priority 1: Upstash REST over HTTPS (Port 443) -> 100% reliable, never blocked by firewalls/ISPs!
    - Priority 2: Native Redis TCP connection (rediss://)
    """
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    # 1. Prefer Upstash REST over HTTPS (Rock-solid, zero port 6379 firewall timeout issues)
    if UPSTASH_REST_URL and UPSTASH_REST_TOKEN:
        try:
            from upstash_redis.asyncio import Redis as UpstashAsyncRedis
            _redis_client = UpstashAsyncRedis(
                url=UPSTASH_REST_URL,
                token=UPSTASH_REST_TOKEN
            )
            return _redis_client
        except Exception as e:
            print(f"⚠️ Upstash REST client init error ({e}), falling back to TCP...")

    # 2. Fallback to standard aioredis TCP
    if REDIS_URL:
        _redis_client = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5.0  # Production Safeguard
        )
    return _redis_client


def get_db_connection():
    """Returns a SQLite connection with dict-like row access."""
    conn = sqlite3.connect(DB_PATH) # Opens the connection to your gateway.db file; If the file doesn’t exist yet, SQLite automatically creates it for you.
    conn.row_factory = sqlite3.Row # Nrml access row[0],row[1],... Now row["balance_usd"], row["name"]..
    return conn


def init_db():
    """Initializes the database table for API keys and credit balances."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                key_hash TEXT PRIMARY KEY,
                key_prefix TEXT NOT NULL,
                name TEXT NOT NULL,
                balance_usd REAL NOT NULL DEFAULT 5.0,
                total_spent_usd REAL NOT NULL DEFAULT 0.0,
                rpm_limit INTEGER NOT NULL DEFAULT 30,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit() # Permanently saves the table structure to disk..


def hash_key(raw_key: str) -> str:
    """Hashes API key with SHA-256 for secure storage."""
    # Never store plaintext API keys or passwords in a database! If a hacker steals your gateway.db file, they could steal all your developers' keys. But with hashing, they get useless scrambled text
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()


def create_api_key(name: str = "Developer", starter_credits: float = 5.0, rpm_limit: int = 30) -> Dict[str, Any]:
    """Generates a secure API key, stores its hash, and gives starter credits."""
    raw_key = f"sk-live-{secrets.token_hex(16)}" # produces 32 random hexadecimal characters.
    # Python's secrets module uses OS-level cryptographic randomness (CSPRNG), making the key completely unguessable.
    hashed = hash_key(raw_key)
    prefix = f"{raw_key[:12]}...{raw_key[-4:]}" # (e.g. sk-live-5f4a...4c9e)..

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO api_keys (key_hash, key_prefix, name, balance_usd, total_spent_usd, rpm_limit, is_active)
            VALUES (?, ?, ?, ?, 0.0, ?, 1)
            """,
            (hashed, prefix, name, starter_credits, rpm_limit)
        )
        conn.commit()

    return {
        "api_key": raw_key,  # Shown only once upon creation
        "key_prefix": prefix,
        "name": name,
        "balance_usd": starter_credits,
        "rpm_limit": rpm_limit,
        "message": f"Successfully created key with ${starter_credits:.2f} starter credits! Keep this key safe."
    }


def get_key_details(key_hash: str) -> Optional[Dict[str, Any]]:
    """Retrieves key details from the database."""
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM api_keys WHERE key_hash = ?", (key_hash,)).fetchone()
        if row:
            return dict(row)
    return None


def recharge_key(raw_key_or_prefix: str, amount_usd: float) -> Dict[str, Any]:
    """Top up credits for an API key."""
    if amount_usd <= 0:
        raise HTTPException(status_code=400, detail="Recharge amount must be greater than $0.00.")

    target_hash = hash_key(raw_key_or_prefix)

    with get_db_connection() as conn:
        # Check by hash first, then prefix
        row = conn.execute(
            "SELECT * FROM api_keys WHERE key_hash = ? OR key_prefix = ?",
            (target_hash, raw_key_or_prefix)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="API key not found.")

        new_balance = row["balance_usd"] + amount_usd
        conn.execute(
            "UPDATE api_keys SET balance_usd = ? WHERE key_hash = ?",
            (new_balance, row["key_hash"])
        )
        conn.commit()

    return {
        "key_prefix": row["key_prefix"],
        "name": row["name"],
        "added_usd": amount_usd,
        "new_balance_usd": round(new_balance, 4),
        "message": f"Successfully recharged! New balance: ${new_balance:.4f}"
    }


def deduct_usage_cost(key_hash: str, cost_usd: float) -> float:
    """Deducts token usage cost from the developer's wallet."""
    with get_db_connection() as conn:
        row = conn.execute("SELECT balance_usd, total_spent_usd FROM api_keys WHERE key_hash = ?", (key_hash,)).fetchone()
        if not row:
            return 0.0

        current_balance = row["balance_usd"]
        current_spent = row["total_spent_usd"]

        new_balance = max(0.0, current_balance - cost_usd)
        new_spent = current_spent + cost_usd

        conn.execute(
            "UPDATE api_keys SET balance_usd = ?, total_spent_usd = ? WHERE key_hash = ?",
            (new_balance, new_spent, key_hash)
        )
        conn.commit()
        return round(new_balance, 6)


async def check_rate_limit(key_hash: str, rpm_limit: int):
    """
    Production Redis Sliding-Window Rate Limiter using Sorted Sets (ZSET).
    Executes in a single atomic pipeline in < 1ms.
    """
    try:
        r = await get_redis_client()
        now = time.time()
        window_start = now - 60.0
        redis_key = f"ratelimit:{key_hash}"

        # Pipeline: Remove expired -> Add current -> Count window -> Set TTL
        pipe = r.pipeline()
        pipe.zremrangebyscore(redis_key, 0, window_start)
        pipe.zadd(redis_key, {str(now): now})
        pipe.zcard(redis_key)
        pipe.expire(redis_key, 60)
        results = await pipe.exec() if hasattr(pipe, "exec") else await pipe.execute()

        request_count = results[2]

        if request_count > rpm_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit of {rpm_limit} requests/minute reached (enforced by Redis).",
                    "current_requests_in_window": request_count,
                    "retry_after_seconds": 60
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        # Fallback safeguard: If Redis connection drops, log warning but don't crash
        print(f"⚠️ Redis rate limiter warning ({e}). Request allowed safely.")


async def verify_api_gateway(auth: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Dict[str, Any]:
    # HTTPAuthorizationCredentials => A helper object with two properties: • auth.scheme: "Bearer" • auth.credentials: "sk-live-5f4a8b2c..."
    """
    API Gateway & Identity Guard:
    1. Validates Bearer API Key
    2. Enforces Distributed Redis Rate Limits (RPM)
    3. Enforces Credit Balance (Quota > $0.00)
    """
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "missing_api_key",
                "message": "Authorization header missing. Pass your key as 'Authorization: Bearer sk-live-...'"
            }
        )

    raw_key = auth.credentials
    hashed = hash_key(raw_key)

    key_record = get_key_details(hashed)
    if not key_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_api_key", "message": "Invalid API key provided."}
        )

    if not key_record["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "key_revoked", "message": "This API key has been revoked or deactivated."}
        )

    # 1. Distributed Redis Sliding-Window Rate Limit Check
    await check_rate_limit(hashed, key_record["rpm_limit"])

    # 2. Wallet Balance / Quota Check
    if key_record["balance_usd"] <= 0.0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "insufficient_quota",
                "message": "You have exhausted your credits. Current balance: $0.00. Please recharge your account.",
                "balance_usd": 0.0,
                "recharge_instructions": "Call POST /v1/keys/recharge to add credits."
            }
        )

    return key_record


# Initialize SQLite table on load
init_db()
