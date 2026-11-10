import os
import sys
import re
import json
import math
import time
import numpy as np
from typing import Optional, Dict, Any, List, Tuple
from dotenv import load_dotenv
try:
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
except ImportError:
    GoogleGenerativeAIEmbeddings = None

try:
    from langchain_openai import OpenAIEmbeddings
except ImportError:
    OpenAIEmbeddings = None

try:
    from fastembed import TextEmbedding
    _fastembed_model = None
except ImportError:
    _fastembed_model = None

# Ensure Windows stdout safely prints UTF-8 logs
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Upstream Redis connection
from gateway.identity import get_redis_client

load_dotenv()

# TTL for cached Q&A: 24 hours (86,400 seconds)
DEFAULT_CACHE_TTL = 86400
SIMILARITY_THRESHOLD = 0.90  # 90% semantic match threshold


# --- 1. EMBEDDING GENERATOR ---

async def get_embedding(text: str) -> List[float]:
    """
    Generates embedding vector for a given text using Google or OpenAI API.
    """
    # 1. Try Google Gemini Embeddings
    google_key = os.getenv("GOOGLE_API_KEY")
    if google_key:
        try:
            embedder = GoogleGenerativeAIEmbeddings(
                model="models/gemini-embedding-001",
                google_api_key=google_key
            )
            return await embedder.aembed_query(text)
        except Exception as e:
            print(f"⚠️ Google embedding fallback ({e}), trying OpenAI...")

    # 2. Try OpenAI Embeddings
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            embedder = OpenAIEmbeddings(
                model="text-embedding-3-small",
                api_key=openai_key,
                timeout=2.0,
                max_retries=0
            )
            return await embedder.aembed_query(text)
        except Exception as e:
            pass

    # 3. Try Local FastEmbed ONNX Embeddings (Zero API cost & local execution)
    global _fastembed_model
    try:
        if _fastembed_model is None:
            from fastembed import TextEmbedding
            _fastembed_model = TextEmbedding()
        embeddings = list(_fastembed_model.embed([text]))
        if embeddings:
            return embeddings[0].tolist()
    except Exception:
        pass

    # If no key available or failed, return empty list
    return []


# --- 2. PURE MATH COSINE SIMILARITY (Zero Extra Dependencies) ---

CONTEXT_DEPENDENT_PATTERNS = [
    # Explicit references to previous conversational turns or what was said
    r"\b(we|you|i)\s+(discussed|talked|spoke|mentioned|chatted|said|asked|covered|agreed|decided)\b",
    r"\b(previous|previously|earlier|above|prior|last)\s+(topic|question|message|turn|conversation|discussion|point|chat|things|thing|response|context)\b",
    r"\bwhat\s+(was|were)\s+(we|the|our)\s+.*\b(discussing|talking about|discuss)\b",
    r"\bwhat\s+did\s+(i|we|you)\s+(say|ask|talk|discuss|mention)\b",
    r"\bwhat\s+was\s+(that|the|my|our)\s+(topic|question|discussion)\b",
    r"\bsummarize\s+(our|the|this|my)\s+(chat|conversation|discussion|history|dialogue)\b",
    r"\bwhat\s+(was|is)\s+my\s+name\b",
    r"\bremember\s+(what|my|who|when)\b",
    r"\b(repeat|clarify)\s+(that|the last|what|our|it)\b",
    r"^\s*(continue|go on|tell me more|more details|explain further|keep going|what else)\s*$",
    r"\bbased on (our|the|previous|earlier)\s+(conversation|discussion|chat|context)\b",
    r"\bas (i|you|we)\s+(said|mentioned|noted|discussed)\b",
]


def is_context_dependent_prompt(prompt: str) -> bool:
    """
    Checks if a prompt relies on conversational state / history.
    Context-dependent prompts (e.g. 'what was the topic we previously discussed')
    MUST NEVER be served from or saved to the global semantic cache.
    """
    if not prompt or not isinstance(prompt, str):
        return True
    p_lower = prompt.lower().strip()
    for pat in CONTEXT_DEPENDENT_PATTERNS:
        if re.search(pat, p_lower):
            return True
    return False


def is_conversational_followup(prompt: str, has_history: bool = False) -> bool:
    """
    Returns True if the prompt cannot be answered in isolation from global semantic cache.
    """
    if is_context_dependent_prompt(prompt):
        return True
    if has_history:
        # If the conversation is already in progress, short referential follow-ups must bypass global cache
        p_lower = prompt.lower().strip()
        words = p_lower.split()
        if len(words) <= 5:
            deictic_words = {"it", "this", "that", "these", "those", "why", "how", "more", "again", "explain", "what", "which", "who"}
            if any(w in deictic_words for w in words):
                return True
    return False


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """
    Calculates Cosine Similarity between two numerical vectors:
    Similarity = (A . B) / (||A|| * ||B||)
    Returns a score between 0.0 (unrelated) and 1.0 (identical meaning).
    """
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0

    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    magnitude_a = math.sqrt(sum(a * a for a in vec_a))
    magnitude_b = math.sqrt(sum(b * b for b in vec_b))

    if magnitude_a == 0.0 or magnitude_b == 0.0:
        return 0.0

    return dot_product / (magnitude_a * magnitude_b)


# --- 3. CHECK SEMANTIC CACHE IN REDIS ---

async def check_semantic_cache(
    prompt: str,
    threshold: float = SIMILARITY_THRESHOLD,
    has_history: bool = False
) -> Tuple[Optional[Dict[str, Any]], List[float]]:
    """
    1. Checks if prompt is context-dependent or conversational follow-up. If so, skips cache!
    2. Generates embedding of incoming prompt.
    3. Compares against all cached entries in Redis.
    4. If similarity >= threshold (0.90) -> returns cached response (CACHE HIT).
    5. Otherwise -> returns (None, prompt_vector) for LLM generation (CACHE MISS).
    """
    # Safeguard: Never serve conversational state questions from global cache!
    if is_conversational_followup(prompt, has_history=has_history):
        prompt_vector = await get_embedding(prompt)
        return None, prompt_vector

    prompt_vector = await get_embedding(prompt)
    if not prompt_vector:
        return None, []

    try:
        r = await get_redis_client()
        # Fetch all active cache item keys
        keys = await r.keys("semcache:*")
        if not keys:
            return None, prompt_vector

        # Batch fetch all cached items in ONE atomic network roundtrip
        if hasattr(r, "mget"):
            raw_items = await r.mget(*keys)
        else:
            raw_items = [await r.get(k) for k in keys]

        # Parse items from raw Redis JSON and filter valid vectors
        items = [json.loads(r) for r in raw_items if r]
        valid_items = [it for it in items if it.get("vector") and len(it.get("vector")) == len(prompt_vector)]

        if not valid_items:
            return None, prompt_vector

        # High-Speed Vectorized Matrix Cosine Similarity (NumPy BLAS / SIMD in C)
        matrix = np.array([it["vector"] for it in valid_items], dtype=np.float32)
        q_vec = np.array(prompt_vector, dtype=np.float32)

        norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(q_vec)
        scores = np.dot(matrix, q_vec) / np.maximum(norms, 1e-9)

        best_idx = int(np.argmax(scores))
        highest_score = float(scores[best_idx])

        if highest_score >= threshold:
            best_item = valid_items[best_idx]
            # Extra safety: ensure the cached item wasn't an accidental context query
            if is_context_dependent_prompt(best_item.get("prompt", "")):
                return None, prompt_vector

            best_match = {
                "cached_prompt": best_item.get("prompt"),
                "response": best_item.get("response"),
                "provider": best_item.get("provider"),
                "similarity_score": round(highest_score, 4),
                "cache_hit": True
            }
            return best_match, prompt_vector

    except Exception as e:
        print(f"⚠️ Semantic cache lookup warning: {e}")

    return None, prompt_vector


# --- 4. SAVE ANSWER TO SEMANTIC CACHE ---

async def save_to_semantic_cache(
    prompt: str,
    prompt_vector: List[float],
    response: str,
    provider: str,
    ttl_seconds: int = DEFAULT_CACHE_TTL
) -> None:
    """
    Saves new (prompt, embedding_vector, response) into Redis with a 24-hr TTL.
    Context-dependent or conversational prompts are rejected.
    """
    if not prompt_vector or is_context_dependent_prompt(prompt):
        return

    try:
        r = await get_redis_client()
        cache_id = f"semcache:{hash(prompt)}"

        cache_payload = {
            "prompt": prompt,
            "vector": prompt_vector,
            "response": response,
            "provider": provider,
            "saved_at": time.time()
        }

        # Write to Redis with TTL (24 hours)
        await r.set(cache_id, json.dumps(cache_payload), ex=ttl_seconds)

    except Exception as e:
        print(f"⚠️ Error saving to semantic cache: {e}")


async def clear_semantic_cache() -> int:
    """Purges all entries from Redis semantic cache (semcache:*)."""
    try:
        r = await get_redis_client()
        keys = await r.keys("semcache:*")
        if keys:
            count = await r.delete(*keys)
            return int(count)
        return 0
    except Exception as e:
        print(f"⚠️ Error clearing semantic cache: {e}")
        return 0


# --- 5. SEMANTIC CACHE CLIENT HELPER ---

class SemanticCacheClient:
    """Helper client wrapper for semantic cache operations."""
    async def get(self, prompt: str, threshold: float = SIMILARITY_THRESHOLD):
        match, _ = await check_semantic_cache(prompt, threshold)
        return match

    async def set(self, prompt: str, response: str, provider: str = "cache", ttl_seconds: int = DEFAULT_CACHE_TTL):
        vector = await get_embedding(prompt)
        await save_to_semantic_cache(prompt, vector, response, provider, ttl_seconds)


def get_semantic_cache() -> SemanticCacheClient:
    return SemanticCacheClient()

