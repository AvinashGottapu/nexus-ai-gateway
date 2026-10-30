import os
import sys
import json
import math
import time
from typing import Optional, Dict, Any, List, Tuple
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_openai import OpenAIEmbeddings

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
                api_key=openai_key
            )
            return await embedder.aembed_query(text)
        except Exception as e:
            print(f"⚠️ OpenAI embedding error ({e})")

    # If no key available, return empty list
    return []


# --- 2. PURE MATH COSINE SIMILARITY (Zero Extra Dependencies) ---

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
    threshold: float = SIMILARITY_THRESHOLD
) -> Tuple[Optional[Dict[str, Any]], List[float]]:
    """
    1. Generates embedding of incoming prompt.
    2. Compares against all cached entries in Redis.
    3. If similarity >= threshold (0.90) -> returns cached response (CACHE HIT).
    4. Otherwise -> returns (None, prompt_vector) for LLM generation (CACHE MISS).
    """
    prompt_vector = await get_embedding(prompt)
    if not prompt_vector:
        return None, []

    try:
        r = await get_redis_client()
        # Fetch all active cache item keys
        keys = await r.keys("semcache:*")
        if not keys:
            return None, prompt_vector

        best_match = None
        highest_similarity = 0.0

        for key in keys:
            raw_data = await r.get(key)
            if not raw_data:
                continue

            item = json.loads(raw_data)
            cached_vector = item.get("vector", [])

            score = cosine_similarity(prompt_vector, cached_vector)

            if score > highest_similarity:
                highest_similarity = score
                if score >= threshold:
                    best_match = {
                        "cached_prompt": item.get("prompt"),
                        "response": item.get("response"),
                        "provider": item.get("provider"),
                        "similarity_score": round(score, 4),
                        "cache_hit": True
                    }

        if best_match:
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
    """
    if not prompt_vector:
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
