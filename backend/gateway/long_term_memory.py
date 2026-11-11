import json
import re
import uuid
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from langchain_core.messages import SystemMessage

from gateway.identity import get_db_connection
from gateway.session_store import call_fast_summarizer
from cache.semantic_cache import get_embedding

# =====================================================================
# LONG-TERM USER MEMORY ENGINE (SQLite + Vectorized NumPy Retrieval)
# =====================================================================

DEFAULT_TOP_K = 5
DEFAULT_MIN_SIMILARITY = 0.45
DEDUP_SIMILARITY_THRESHOLD = 0.93
PROFILE_BOOST = 0.08

_TRIVIAL_PROMPTS = {"hi", "hello", "hey", "ok", "okay", "thanks", "thank you", "bye", "yo"}

_EXTRACTION_PROMPT_TEMPLATE = """You are a Long-Term User Memory Extractor for an AI assistant.
Analyze ONLY what the user explicitly revealed about themselves in this turn.

Existing Saved Memories for this User:
{existing_memories}

User Message:
{user_prompt}

Assistant Response:
{assistant_response}

Rules:
1. Extract ONLY durable, reusable personal facts, preferences, skills, tech stack, roles, or ongoing projects worth remembering across future separate chats.
2. Combine closely related details from the same statement into a single concise fact (e.g. "User is building Nexus AI Gateway using FastAPI, React, and Upstash Redis." instead of splitting each tool into separate facts).
3. If a new fact updates or contradicts an existing saved memory (e.g., moved to a new city, changed role), set "replaces_id" to that existing memory's ID.
4. IGNORE temporary questions, trivia (e.g., "What is Kafka?"), greetings, small talk, or facts about the AI assistant.
5. Return ONLY a JSON array of objects (or [] if nothing durable was revealed).

Format:
[{{"fact": "User ...", "category": "profile|preference|project|fact", "replaces_id": null}}]"""


def _cosine_scores(query_vec: List[float], candidate_vectors: List[List[float]]) -> np.ndarray:
    """Computes vectorized cosine similarity between a query vector and candidate matrix."""
    matrix = np.array(candidate_vectors, dtype=np.float32)
    q_vec = np.array(query_vec, dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(q_vec)
    return np.dot(matrix, q_vec) / np.maximum(norms, 1e-9)


def _filter_compatible_rows(
    rows: list,
    target_dim: int
) -> Tuple[List[Any], List[List[float]]]:
    """Filters SQLite rows to valid JSON vectors matching the active embedding dimension."""
    valid_rows = []
    vectors = []
    for row in rows:
        try:
            vec = json.loads(row["embedding_json"])
            if isinstance(vec, list) and len(vec) == target_dim:
                valid_rows.append(row)
                vectors.append(vec)
        except Exception:
            continue
    return valid_rows, vectors


def _parse_extracted_json(raw_output: Optional[str]) -> List[Dict[str, str]]:
    """Parses JSON array from LLM output, stripping optional markdown code fences."""
    if not raw_output:
        return []
    cleaned = raw_output.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    bracket_match = re.search(r"\[[\s\S]*\]", cleaned)
    if not bracket_match:
        return []

    try:
        parsed = json.loads(bracket_match.group(0))
        if not isinstance(parsed, list):
            return []
        valid = []
        for item in parsed:
            if isinstance(item, dict) and isinstance(item.get("fact"), str) and len(item["fact"].strip()) > 5:
                cat = str(item.get("category", "fact")).lower().strip()
                if cat not in {"profile", "preference", "project", "fact"}:
                    cat = "fact"
                replaces_id = item.get("replaces_id")
                valid.append({
                    "fact": item["fact"].strip(),
                    "category": cat,
                    "replaces_id": str(replaces_id).strip() if replaces_id else None
                })
        return valid
    except Exception:
        return []


# =====================================================================
# 1. READ PATH: SEMANTIC RETRIEVAL & PROMPT INJECTION
# =====================================================================

async def retrieve_user_memories(
    user_id: str,
    prompt_vector: List[float],
    top_k: int = DEFAULT_TOP_K,
    min_score: float = DEFAULT_MIN_SIMILARITY
) -> List[str]:
    """
    Retrieves top-K semantically relevant long-term facts for user_id via SQLite + NumPy.
    """
    if not user_id or not prompt_vector:
        return []

    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT fact, category, embedding_json
            FROM user_memories
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,)
        ).fetchall()

    if not rows:
        return []

    valid_rows, vectors = _filter_compatible_rows(rows, len(prompt_vector))
    if not valid_rows:
        return []

    raw_scores = _cosine_scores(prompt_vector, vectors)
    scored: List[Tuple[float, str]] = []
    for row, sim in zip(valid_rows, raw_scores):
        score = float(sim)
        if row["category"] == "profile":
            score += PROFILE_BOOST
        if score >= min_score:
            scored.append((score, row["fact"]))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [fact for _, fact in scored[:top_k]]


async def inject_long_term_memory(
    chat_history: list,
    user_id: Optional[str],
    prompt: str,
    prompt_vector: Optional[List[float]] = None
) -> list:
    """
    Retrieves relevant long-term user memories and prepends a SystemMessage block
    before short-term working memory turns.
    """
    if not user_id or user_id == "usr_anonymous":
        return chat_history

    try:
        vec = prompt_vector if prompt_vector else await get_embedding(prompt)
        facts = await retrieve_user_memories(user_id, vec)
        if not facts:
            return chat_history

        memory_lines = "\n".join(f"- {fact}" for fact in facts)
        ltm_message = SystemMessage(
            content=(
                "[LONG-TERM MEMORY ABOUT THIS USER]\n"
                "Use these saved facts from past conversations only when relevant:\n"
                f"{memory_lines}"
            )
        )
        return [ltm_message] + list(chat_history)
    except Exception as e:
        print(f"⚠️ Long-term memory retrieval warning: {e}")
        return chat_history


# =====================================================================
# 2. WRITE PATH: ASYNC FACT EXTRACTION & CONSOLIDATION
# =====================================================================

def _find_matching_memory_id(
    new_vec: List[float],
    existing_rows: list,
    threshold: float = DEDUP_SIMILARITY_THRESHOLD
) -> Optional[str]:
    """Finds an existing memory row with cosine similarity >= threshold for upsert."""
    valid_rows, vectors = _filter_compatible_rows(existing_rows, len(new_vec))
    if not valid_rows:
        return None
    scores = _cosine_scores(new_vec, vectors)
    best_idx = int(np.argmax(scores))
    if float(scores[best_idx]) >= threshold:
        return str(valid_rows[best_idx]["id"])
    return None


async def extract_and_save_memories(
    user_id: Optional[str],
    user_prompt: str,
    assistant_response: str = ""
) -> List[Dict[str, Any]]:
    """
    Non-blocking background worker: extracts durable facts from the user's turn
    and consolidates/upserts them into SQLite user_memories.
    """
    if not user_id or user_id == "usr_anonymous" or not user_prompt:
        return []

    stripped = user_prompt.strip()
    if len(stripped) < 8 or stripped.lower().rstrip("!.?") in _TRIVIAL_PROMPTS:
        return []

    with get_db_connection() as conn:
        existing_rows = list(conn.execute(
            """
            SELECT id, fact, embedding_json
            FROM user_memories
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,)
        ).fetchall())

    existing_summary = (
        "\n".join(f"- [{r['id']}] {r['fact']}" for r in existing_rows[:20])
        if existing_rows else "None"
    )
    existing_ids = {str(r["id"]) for r in existing_rows}

    extraction_prompt = _EXTRACTION_PROMPT_TEMPLATE.format(
        existing_memories=existing_summary,
        user_prompt=stripped[:1000],
        assistant_response=(assistant_response or "")[:400]
    )
    raw_json = await call_fast_summarizer(extraction_prompt)
    extracted = _parse_extracted_json(raw_json)
    if not extracted:
        return []

    saved_items: List[Dict[str, Any]] = []
    for item in extracted:
        vec = await get_embedding(item["fact"])
        if not vec:
            continue

        # Prefer explicit semantic contradiction/update target; fallback to high-threshold vector dedup
        replaces_id = item.get("replaces_id")
        if replaces_id and replaces_id in existing_ids:
            matched_id = replaces_id
        else:
            matched_id = _find_matching_memory_id(vec, existing_rows)

        vec_json = json.dumps(vec)

        with get_db_connection() as conn:
            if matched_id:
                conn.execute(
                    """
                    UPDATE user_memories
                    SET fact = ?, category = ?, embedding_json = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND user_id = ?
                    """,
                    (item["fact"], item["category"], vec_json, matched_id, user_id)
                )
                saved_items.append({"id": matched_id, "action": "updated", **item})
            else:
                mem_id = f"mem_{uuid.uuid4().hex[:10]}"
                conn.execute(
                    """
                    INSERT INTO user_memories (id, user_id, fact, category, embedding_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (mem_id, user_id, item["fact"], item["category"], vec_json)
                )
                existing_rows.append({"id": mem_id, "fact": item["fact"], "embedding_json": vec_json})
                existing_ids.add(mem_id)
                saved_items.append({"id": mem_id, "action": "inserted", **item})
            conn.commit()

    return saved_items


# =====================================================================
# 3. MANAGEMENT CRUD (For Frontend Settings & User Control)
# =====================================================================

def list_user_memories(user_id: str) -> List[Dict[str, Any]]:
    """Lists all stored long-term facts for a user (omitting raw embedding vectors)."""
    if not user_id:
        return []
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, fact, category, created_at, updated_at
            FROM user_memories
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,)
        ).fetchall()
    return [
        {
            "id": r["id"],
            "user_id": r["user_id"],
            "fact": r["fact"],
            "category": r["category"],
            "createdAt": str(r["created_at"]),
            "updatedAt": str(r["updated_at"])
        }
        for r in rows
    ]


def delete_user_memory(memory_id: str, user_id: Optional[str] = None) -> bool:
    """Deletes a specific long-term memory row."""
    with get_db_connection() as conn:
        if user_id:
            cur = conn.execute(
                "DELETE FROM user_memories WHERE id = ? AND user_id = ?",
                (memory_id, user_id)
            )
        else:
            cur = conn.execute("DELETE FROM user_memories WHERE id = ?", (memory_id,))
        conn.commit()
        return cur.rowcount > 0


def clear_user_memories(user_id: str) -> int:
    """Deletes all long-term memories for a given user_id."""
    if not user_id:
        return 0
    with get_db_connection() as conn:
        cur = conn.execute("DELETE FROM user_memories WHERE user_id = ?", (user_id,))
        conn.commit()
        return int(cur.rowcount)
