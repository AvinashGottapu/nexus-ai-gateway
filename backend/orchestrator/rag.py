import os
import json
import time
import secrets
from typing import List, Dict, Any, Optional
from gateway.identity import get_redis_client
from cache.semantic_cache import get_embedding, cosine_similarity

# 2 Hours TTL = 7,200 seconds (Auto-wiped from Redis when expired)
DEFAULT_RAG_TTL = 7200

# Vector-Threshold Auto-RAG: Automatically promote general queries to RAG
# if cosine similarity against active Redis document chunks meets or exceeds this threshold.
AUTO_RAG_THRESHOLD = float(os.getenv("AUTO_RAG_THRESHOLD", "0.70"))


async def has_active_knowledge(key_prefix: str = "global") -> bool:
    """
    Fast check: returns True if any active 2-hour knowledge chunks exist in Redis.
    """
    try:
        r = await get_redis_client()
        keys = await r.keys(f"rag:{key_prefix}:*")
        return len(keys) > 0
    except Exception:
        return False


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> List[str]:
    """
    Splits input text or documents into overlapping chunks for precise retrieval.
    """
    text = text.strip()
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += (chunk_size - overlap)
    return chunks


async def ingest_temporary_knowledge(
    text: str,
    source_name: str = "user_note",
    key_prefix: str = "global",
    ttl_seconds: int = DEFAULT_RAG_TTL
) -> Dict[str, Any]:
    """
    Ingests text lines or uploaded document chunks into Redis.
    Guaranteed self-destruction after 2 hours (TTL = 7,200 seconds).
    """
    if not text or not text.strip():
        return {"status": "skipped", "message": "Text is empty"}

    r = await get_redis_client()
    chunks = chunk_text(text)
    doc_id = secrets.token_hex(4)
    saved_chunks_count = 0

    for idx, chunk in enumerate(chunks):
        vector = await get_embedding(chunk)
        if not vector:
            continue

        redis_key = f"rag:{key_prefix}:{doc_id}:{idx}"
        payload = {
            "source": source_name,
            "chunk_text": chunk,
            "vector": vector,
            "created_at": time.time(),
            "expires_in_seconds": ttl_seconds
        }

        # Store in Redis with strict 2-hour TTL
        await r.set(redis_key, json.dumps(payload), ex=ttl_seconds)
        saved_chunks_count += 1

    return {
        "status": "ingested",
        "doc_id": doc_id,
        "source": source_name,
        "chunks_stored": saved_chunks_count,
        "ttl_hours": ttl_seconds / 3600,
        "message": f"Successfully stored {saved_chunks_count} knowledge chunks in Redis. Will auto-expire in 2 hours."
    }


async def search_temporary_knowledge(
    query: str,
    key_prefix: str = "global",
    top_k: int = 2,
    min_similarity: float = 0.65,
    query_vector: Optional[List[float]] = None
) -> List[Dict[str, Any]]:
    """
    Searches active 2-hour knowledge chunks in Redis using Cosine Similarity.
    Reuses pre-computed query_vector (e.g. from semantic cache) to avoid re-embedding.
    """
    if not query_vector:
        query_vector = await get_embedding(query)
    if not query_vector:
        return []

    r = await get_redis_client()
    # Scan for active chunks matching the prefix
    pattern = f"rag:{key_prefix}:*"
    keys = await r.keys(pattern)

    if not keys:
        return []

    scored_chunks = []
    for k in keys:
        raw_data = await r.get(k)
        if not raw_data:
            continue

        data = json.loads(raw_data)
        chunk_vec = data.get("vector", [])
        score = cosine_similarity(query_vector, chunk_vec)

        if score >= min_similarity:
            scored_chunks.append({
                "source": data.get("source"),
                "chunk_text": data.get("chunk_text"),
                "similarity_score": round(score, 4)
            })

    # Sort by highest similarity first and return top_k
    scored_chunks.sort(key=lambda x: x["similarity_score"], reverse=True)
    return scored_chunks[:top_k]
