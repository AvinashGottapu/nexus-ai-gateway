import os
import json
import math
import re
import time
import secrets
from collections import Counter
from typing import List, Dict, Any, Optional
from gateway.identity import get_redis_client
from cache.semantic_cache import get_embedding, cosine_similarity

# 2 Hours TTL = 7,200 seconds (Auto-wiped from Redis when expired)
DEFAULT_RAG_TTL = 7200

# Vector-Threshold Auto-RAG: Automatically promote general queries to RAG
# if cosine similarity against active Redis document chunks meets or exceeds this threshold.
AUTO_RAG_THRESHOLD = float(os.getenv("AUTO_RAG_THRESHOLD", "0.70"))

# Default Reciprocal Rank Fusion smoothing constant (industry standard = 60)
RRF_K_CONSTANT = 60


# =====================================================================
# 1. BM25 SPARSE KEYWORD SCORING (Best Matching 25)
# =====================================================================

def tokenize_text(text: str) -> List[str]:
    """
    Extracts lowercase alphanumeric tokens and codes while preserving
    identifiers (e.g. ERR-404, P1, 99.95%, 15%, SLA).
    """
    if not text:
        return []
    # Tokenize words, numbers, percentages, and hyphenated/underscore codes
    return re.findall(r'[a-zA-Z0-9_\-\.%]+', text.lower())


class BM25Okapi:
    """
    Native, high-performance BM25Okapi ranking implementation (Zero external pip dependencies).
    Balances Term Frequency (TF) with saturation (k1) and Document Length Normalization (b).
    """
    def __init__(self, corpus: List[List[str]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus_size = len(corpus)
        self.avgdl = sum(len(d) for d in corpus) / (self.corpus_size or 1.0)
        self.doc_freqs: List[Counter] = []
        self.idf: Dict[str, float] = {}
        self.doc_len = [len(d) for d in corpus]

        # Calculate document frequencies
        df: Dict[str, int] = {}
        for doc in corpus:
            freqs = Counter(doc)
            self.doc_freqs.append(freqs)
            for word in freqs.keys():
                df[word] = df.get(word, 0) + 1

        # Calculate IDF with standard Robertson-Spärck Jones formula & floor smoothing
        for word, freq in df.items():
            self.idf[word] = math.log((self.corpus_size - freq + 0.5) / (freq + 0.5) + 1.0)

    def get_scores(self, query: List[str]) -> List[float]:
        """Calculates BM25 score for every document in the corpus against the query tokens."""
        scores = [0.0] * self.corpus_size
        for word in query:
            if word not in self.idf:
                continue
            idf = self.idf[word]
            for idx, freqs in enumerate(self.doc_freqs):
                if word not in freqs:
                    continue
                tf = freqs[word]
                doc_len = self.doc_len[idx]
                numerator = idf * tf * (self.k1 + 1.0)
                denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / (self.avgdl or 1.0)))
                scores[idx] += numerator / (denominator or 1.0)
        return scores


# =====================================================================
# 2. RECIPROCAL RANK FUSION (RRF) ENGINE
# =====================================================================

def apply_reciprocal_rank_fusion(
    vector_ranked: List[Dict[str, Any]],
    bm25_ranked: List[Dict[str, Any]],
    k: int = RRF_K_CONSTANT,
    top_k: int = 2
) -> List[Dict[str, Any]]:
    """
    Fuses dense semantic ranks (Vector Cosine) with sparse keyword ranks (BM25)
    using the Reciprocal Rank Fusion (RRF) formula:
        RRF_Score(d) = 1/(k + rank_vector) + 1/(k + rank_bm25)
    Guarantees optimal retrieval for both conceptual queries and exact keyword/SKU queries.
    """
    rrf_table: Dict[str, Dict[str, Any]] = {}

    # 1. Accumulate Reciprocal Ranks from Vector Search (Dense)
    for rank, item in enumerate(vector_ranked, start=1):
        cid = item.get("chunk_id") or item["chunk_text"]
        if cid not in rrf_table:
            rrf_table[cid] = {"item": item, "rrf_score": 0.0, "vector_rank": rank, "bm25_rank": None}
        else:
            rrf_table[cid]["vector_rank"] = rank
        rrf_table[cid]["rrf_score"] += 1.0 / (k + rank)

    # 2. Accumulate Reciprocal Ranks from BM25 Search (Sparse)
    for rank, item in enumerate(bm25_ranked, start=1):
        cid = item.get("chunk_id") or item["chunk_text"]
        if cid not in rrf_table:
            rrf_table[cid] = {"item": item, "rrf_score": 0.0, "vector_rank": None, "bm25_rank": rank}
        else:
            rrf_table[cid]["bm25_rank"] = rank
        rrf_table[cid]["rrf_score"] += 1.0 / (k + rank)

    # 3. Sort chunks descending by combined RRF score
    sorted_entries = sorted(rrf_table.values(), key=lambda x: x["rrf_score"], reverse=True)

    # 4. Format top_k fused results
    final_chunks: List[Dict[str, Any]] = []
    for entry in sorted_entries[:top_k]:
        item = entry["item"].copy()
        item["rrf_score"] = round(entry["rrf_score"], 5)
        item["vector_rank"] = entry["vector_rank"]
        item["bm25_rank"] = entry["bm25_rank"]
        item["retrieval_method"] = "hybrid_rrf (dense vector + sparse bm25)"
        final_chunks.append(item)

    return final_chunks


# =====================================================================
# 3. RAG LIFECYCLE: INGESTION, CHUNKING & HYBRID RETRIEVAL
# =====================================================================

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
            "chunk_id": redis_key,
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
    Production Hybrid Search combining:
    1. Dense Vector Search (Cosine Similarity on Redis vectors)
    2. Sparse Keyword Search (BM25Okapi on chunk text)
    3. Reciprocal Rank Fusion (RRF with k=60) to merge ranks.
    """
    # 1. Fetch pre-computed or fresh query vector
    if not query_vector:
        query_vector = await get_embedding(query)

    r = await get_redis_client()
    pattern = f"rag:{key_prefix}:*"
    keys = await r.keys(pattern)

    if not keys:
        return []

    # 2. Retrieve all active chunks from Redis
    all_chunks: List[Dict[str, Any]] = []
    for k in keys:
        raw_data = await r.get(k)
        if not raw_data:
            continue
        try:
            data = json.loads(raw_data)
            all_chunks.append({
                "chunk_id": data.get("chunk_id", k),
                "source": data.get("source", "knowledge_base"),
                "chunk_text": data.get("chunk_text", ""),
                "vector": data.get("vector", [])
            })
        except Exception:
            continue

    if not all_chunks:
        return []

    # 3. Dense Vector Ranking (Cosine Similarity)
    vector_scored = []
    for c in all_chunks:
        score = 0.0
        if query_vector and c["vector"]:
            score = cosine_similarity(query_vector, c["vector"])
        vector_scored.append({
            **c,
            "similarity_score": round(score, 4)
        })
    # Sort descending by vector similarity
    vector_ranked = sorted(vector_scored, key=lambda x: x["similarity_score"], reverse=True)

    # 4. Sparse BM25 Keyword Ranking
    tokenized_query = tokenize_text(query)
    tokenized_corpus = [tokenize_text(c["chunk_text"]) for c in all_chunks]

    bm25 = BM25Okapi(tokenized_corpus)
    bm25_scores = bm25.get_scores(tokenized_query)

    bm25_scored = []
    for idx, c in enumerate(all_chunks):
        bm25_scored.append({
            **c,
            "similarity_score": vector_scored[idx]["similarity_score"],
            "bm25_score": round(bm25_scores[idx], 4)
        })
    # Sort descending by BM25 keyword score
    bm25_ranked = sorted(bm25_scored, key=lambda x: x["bm25_score"], reverse=True)

    # 5. Merge using Reciprocal Rank Fusion (RRF)
    # Filter candidate pool so completely irrelevant chunks (zero keyword match & low vector sim) are excluded
    candidates_vector = [c for c in vector_ranked if c["similarity_score"] >= (min_similarity - 0.20)]
    candidates_bm25 = [c for c in bm25_ranked if c["bm25_score"] > 0.0 or c["similarity_score"] >= min_similarity]

    # If both candidate filters empty, use top vector ranked as fallback
    if not candidates_vector and not candidates_bm25:
        candidates_vector = vector_ranked[:top_k]
        candidates_bm25 = bm25_ranked[:top_k]

    fused_chunks = apply_reciprocal_rank_fusion(
        vector_ranked=candidates_vector,
        bm25_ranked=candidates_bm25,
        k=RRF_K_CONSTANT,
        top_k=top_k
    )

    return fused_chunks
