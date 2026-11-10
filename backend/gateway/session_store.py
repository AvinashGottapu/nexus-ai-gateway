import os
import json
import uuid
import time
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from gateway.identity import get_redis_client

# =====================================================================
# LAYER C: PRODUCTION SESSION STORE (Token-Budgeted Short Memory + Rolling Summarizer + Sliding TTL)
# =====================================================================

# Automatic Session Expiration: 2 hours (7,200 seconds) sliding window
DEFAULT_SESSION_TTL = 7200

# Working memory token budget for verbatim turns (leaves headroom for summary + prompt)
DEFAULT_TOKEN_BUDGET = 2500

# Maximum raw messages stored in Redis list before trimming
MAX_RAW_BUFFER_MESSAGES = 40

# Minimum threshold of overflow messages needed before triggering the background summarizer
MIN_OVERFLOW_BATCH_TO_SUMMARIZE = 4


def count_tokens(text: str) -> int:
    """
    Sub-millisecond token counter:
    Blends word count + character density for reliable token budgeting without external dependencies.
    """
    if not text:
        return 0
    words = len(text.split())
    chars = len(text)
    return max(1, int((words * 1.3) + (chars / 15.0)))


def generate_session_id() -> str:
    """Generates a clean, unique session identifier for new conversations."""
    return f"sess_{uuid.uuid4().hex[:12]}"


def _get_session_key(session_id: str) -> str:
    return f"session:{session_id}:messages"


def _get_summary_key(session_id: str) -> str:
    return f"session:{session_id}:summary"


def _get_last_summarized_id_key(session_id: str) -> str:
    return f"session:{session_id}:last_summarized_id"


# =====================================================================
# 1. ROLLING SUMMARY STORAGE (Redis Fast Cache + SQLite Permanent)
# =====================================================================

async def get_session_last_summarized_id(session_id: str) -> Optional[str]:
    """Returns the message ID of the last turn incorporated into the summary."""
    if not session_id:
        return None
    r = await get_redis_client()
    if r:
        try:
            val = await r.get(_get_last_summarized_id_key(session_id))
            if val:
                return val.decode("utf-8") if isinstance(val, bytes) else str(val)
        except Exception:
            pass
    return None


async def save_session_last_summarized_id(session_id: str, msg_id: str) -> None:
    """Persists the watermark message ID of the last turn summarized."""
    if not session_id or not msg_id:
        return
    r = await get_redis_client()
    if r:
        try:
            await r.set(_get_last_summarized_id_key(session_id), str(msg_id), ex=DEFAULT_SESSION_TTL)
        except Exception as e:
            print(f"⚠️ Redis last summarized ID save warning ({e})")


async def get_session_summary(session_id: str) -> Optional[str]:
    """
    Retrieves the rolling conversation summary from Redis (sub-millisecond).
    If Redis expired, hydrates automatically from SQLite permanent storage.
    """
    if not session_id:
        return None

    r = await get_redis_client()
    if r:
        try:
            cached = await r.get(_get_summary_key(session_id))
            if cached:
                return cached.decode("utf-8") if isinstance(cached, bytes) else str(cached)
        except Exception:
            pass

    # Cold-start fallback: check SQLite
    try:
        from gateway.identity import get_conversation_summary
        db_summary = get_conversation_summary(session_id)
        if db_summary and r:
            try:
                await r.set(_get_summary_key(session_id), db_summary, ex=DEFAULT_SESSION_TTL)
            except Exception:
                pass
        return db_summary
    except Exception:
        return None


async def save_session_summary(session_id: str, summary: str) -> None:
    """Saves rolling summary to both Redis (2-hr sliding TTL) and SQLite (permanent)."""
    if not session_id or not summary:
        return

    # 1. Save to Redis
    r = await get_redis_client()
    if r:
        try:
            await r.set(_get_summary_key(session_id), summary, ex=DEFAULT_SESSION_TTL)
        except Exception as e:
            print(f"⚠️ Redis summary save warning ({e})")

    # 2. Save to SQLite
    try:
        from gateway.identity import save_conversation_summary
        save_conversation_summary(session_id, summary)
    except Exception as e:
        print(f"⚠️ SQLite summary save warning ({e})")


# =====================================================================
# 2. FAST BACKGROUND LLM SUMMARIZER
# =====================================================================

async def call_fast_summarizer(prompt: str) -> Optional[str]:
    """
    Calls an ultra-fast model (Gemini 3.5 Flash Lite in ~150ms or fallback)
    to compress older turns into 2-3 concise sentences.
    """
    # 1. Primary: Gemini 3.5 Flash Lite (High quota, sub-200ms) with 2.5 fallback
    google_key = os.getenv("GOOGLE_API_KEY")
    if google_key:
        for gem_model in ["gemini-3.5-flash-lite", "gemini-2.5-flash"]:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                llm = ChatGoogleGenerativeAI(
                    model=gem_model,
                    google_api_key=google_key,
                    temperature=0.2,
                    max_output_tokens=200,
                    timeout=4.0
                )
                res = await llm.ainvoke(prompt)
                if res and res.content:
                    return res.content.strip()
            except Exception as e:
                print(f"⚠️ Gemini {gem_model} summarizer notice ({e})")

    # 2. Fallback: Groq
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            from langchain_groq import ChatGroq
            llm = ChatGroq(
                model="llama-3.3-70b-versatile",
                api_key=groq_key,
                temperature=0.2,
                max_tokens=200,
                timeout=4.0
            )
            res = await llm.ainvoke(prompt)
            if res and res.content:
                return res.content.strip()
        except Exception as e:
            print(f"⚠️ Groq summarizer notice ({e})")

    return None


async def update_rolling_summary(
    session_id: str, 
    overflow_messages: List[Dict[str, Any]]
) -> Optional[str]:
    """
    Incremental Delta Summarizer:
    1. Receives newly overflowed turns that occurred since the last watermark.
    2. Merges these delta turns with the existing summary.
    3. Saves updated summary, watermark ID, and count in Redis & SQLite.
    """
    if not session_id or not overflow_messages:
        return None

    existing_summary = await get_session_summary(session_id)

    # Format ONLY the newly overflowed turns
    lines = []
    for m in overflow_messages:
        role = m.get("role", "user").capitalize()
        content = m.get("content", "").strip()[:600]
        if content:
            lines.append(f"{role}: {content}")
    transcript = "\n".join(lines)

    prompt = (
        f"You are an AI conversation memory compressor.\n"
        f"Existing Summary of Earlier Conversation:\n{existing_summary or 'None'}\n\n"
        f"New older dialogue to incorporate:\n{transcript}\n\n"
        f"Task: Update the summary into 2-3 concise sentences. Capture key user facts, preferences, decisions, and technical topics discussed. Avoid filler words."
    )

    new_summary = await call_fast_summarizer(prompt)
    if new_summary and len(new_summary) > 10:
        await save_session_summary(session_id, new_summary)
        # Advance the watermark ID to the newest overflowed message
        last_msg = overflow_messages[-1]
        if last_msg.get("id"):
            await save_session_last_summarized_id(session_id, last_msg["id"])
        return new_summary

    return existing_summary


# =====================================================================
# 3. MESSAGE RETRIEVAL & TOKEN BUDGETING
# =====================================================================

async def get_session_messages(
    session_id: str, 
    max_messages: int = MAX_RAW_BUFFER_MESSAGES
) -> List[Dict[str, Any]]:
    """
    Retrieves the raw JSON message history from Redis:
    [
        {"role": "user", "content": "...", "tokens": 12, "timestamp": 173...},
        {"role": "assistant", "content": "...", "tokens": 45, "timestamp": 173...}
    ]
    """
    if not session_id:
        return []

    r = await get_redis_client()
    if not r:
        return []

    try:
        key = _get_session_key(session_id)
        raw_items = await r.lrange(key, -max_messages, -1)
        if not raw_items:
            # ❄️ Cold-start Fallback: Hydrate working memory from SQLite permanent storage
            try:
                from gateway.identity import get_conversation_messages
                db_messages = get_conversation_messages(session_id)
                if db_messages:
                    pipe = r.pipeline()
                    for db_m in db_messages[-max_messages:]:
                        c = db_m.get("content", "")
                        tok = count_tokens(c)
                        db_id = db_m.get("id")
                        msg_id = f"msg_db_{db_id}" if db_id is not None else f"msg_{uuid.uuid4().hex[:10]}"
                        payload = json.dumps({
                            "id": msg_id,
                            "role": db_m.get("role", "user"),
                            "content": c,
                            "tokens": tok,
                            "timestamp": int(time.time())
                        })
                        pipe.rpush(key, payload)
                    pipe.expire(key, DEFAULT_SESSION_TTL)
                    if hasattr(pipe, "exec"):
                        await pipe.exec()
                    else:
                        await pipe.execute()

                    raw_items = await r.lrange(key, -max_messages, -1)
            except Exception as hydrate_err:
                print(f"⚠️ SQLite hydration notice ({hydrate_err})")

        if not raw_items:
            return []

        messages = []
        for item in raw_items:
            try:
                data = json.loads(item)
                if "id" not in data:
                    data["id"] = f"msg_{uuid.uuid4().hex[:10]}"
                if "tokens" not in data:
                    data["tokens"] = count_tokens(data.get("content", ""))
                messages.append(data)
            except Exception:
                continue
        return messages
    except Exception as e:
        print(f"⚠️ Session store read warning ({e})")
        return []


async def get_token_budgeted_messages(
    session_id: str,
    max_tokens: int = DEFAULT_TOKEN_BUDGET
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Production Token-Budgeted Partitioning with Watermark Early-Break:
    - Walks BACKWARDS from the latest turn.
    - Collects recent turns verbatim up to max_tokens.
    - Siphons older turns that exceed budget into overflow_messages.
    - BREAKS immediately when it encounters the last summarized turn (watermark),
      ensuring overflow_messages contains ONLY the newly overflowed turns.
    """
    raw_history = await get_session_messages(session_id, max_messages=MAX_RAW_BUFFER_MESSAGES)
    if not raw_history:
        return [], []

    # Check watermark of last summarized turn
    last_summarized_id = await get_session_last_summarized_id(session_id)

    verbatim_messages: List[Dict[str, Any]] = []
    overflow_messages: List[Dict[str, Any]] = []
    accumulated_tokens = 0
    budget_exceeded = False

    # Walk backwards from most recent message
    for msg in reversed(raw_history):
        msg_id = msg.get("id")

        # Early Break: Stop as soon as we reach the turn that was already summarized
        if budget_exceeded and msg_id and msg_id == last_summarized_id:
            break

        tokens = msg.get("tokens", count_tokens(msg.get("content", "")))
        if (budget_exceeded or (accumulated_tokens + tokens > max_tokens)) and len(verbatim_messages) >= 2:
            budget_exceeded = True
            overflow_messages.insert(0, msg)
        else:
            verbatim_messages.insert(0, msg)
            accumulated_tokens += tokens

    return verbatim_messages, overflow_messages


async def get_session_langchain_messages(
    session_id: str, 
    max_tokens: int = DEFAULT_TOKEN_BUDGET
) -> List[BaseMessage]:
    """
    ChatGPT / Gemini Hybrid Working Memory:
    1. Partitions history into verbatim (recent) and overflow (older).
    2. If overflow >= 4 messages, triggers background rolling summarizer.
    3. Injects SystemMessage with rolling summary at the top (50 tokens).
    4. Appends recent verbatim turns (word-for-word).
    """
    verbatim_messages, overflow_messages = await get_token_budgeted_messages(session_id, max_tokens=max_tokens)
    
    # Trigger background summarizer if 4+ NEW overflow messages accumulated
    if len(overflow_messages) >= MIN_OVERFLOW_BATCH_TO_SUMMARIZE:
        try:
            asyncio.create_task(update_rolling_summary(session_id, overflow_messages))
        except Exception:
            pass

    langchain_messages: List[BaseMessage] = []

    # 1. Inject Rolling Summary at the top if present
    summary = await get_session_summary(session_id)
    if summary:
        langchain_messages.append(
            SystemMessage(content=f"Context from earlier in this conversation:\n{summary}")
        )

    # 2. Append recent verbatim messages
    for msg in verbatim_messages:
        role = msg.get("role", "").lower()
        content = msg.get("content", "")

        if role == "user":
            langchain_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            langchain_messages.append(AIMessage(content=content))
        elif role == "system":
            langchain_messages.append(SystemMessage(content=content))

    return langchain_messages


def convert_to_langchain_messages(
    raw_messages: List[Dict[str, Any]], 
    max_tokens: int = DEFAULT_TOKEN_BUDGET
) -> List[BaseMessage]:
    """
    Converts client-provided explicit message arrays (e.g. from developer API)
    into LangChain BaseMessage objects with token budget safety.
    """
    if not raw_messages:
        return []

    budgeted: List[Dict[str, Any]] = []
    accumulated_tokens = 0

    for m in reversed(raw_messages):
        c = m.get("content", "")
        tok = count_tokens(c)
        if accumulated_tokens + tok > max_tokens and len(budgeted) >= 2:
            break
        budgeted.insert(0, m)
        accumulated_tokens += tok

    langchain_msgs: List[BaseMessage] = []
    for m in budgeted:
        role = (m.get("role") or "").lower()
        content = m.get("content") or ""
        if role == "user":
            langchain_msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            langchain_msgs.append(AIMessage(content=content))
        elif role == "system":
            langchain_msgs.append(SystemMessage(content=content))
    return langchain_msgs


def calculate_history_tokens(messages: List[BaseMessage]) -> int:
    """Calculates total token count of a LangChain message sequence."""
    total = 0
    for m in messages:
        total += count_tokens(getattr(m, "content", ""))
    return total


# =====================================================================
# 4. APPENDING & CLEARING SESSIONS
# =====================================================================

async def append_session_message(
    session_id: str,
    role: str,
    content: str,
    ttl_seconds: int = DEFAULT_SESSION_TTL
) -> None:
    """
    Appends a new turn to the user's session in Redis:
    1. Computes token count for the new message.
    2. Stores role, content, token count, and timestamp.
    3. Trims list to MAX_RAW_BUFFER_MESSAGES (keeps Redis RAM bounded).
    4. Resets the 2-hour sliding TTL (EXPIRE key 7200).
    """
    if not session_id or not content.strip():
        return

    r = await get_redis_client()
    if not r:
        return

    tokens = count_tokens(content.strip())
    msg_id = f"msg_{uuid.uuid4().hex[:10]}"
    payload = json.dumps({
        "id": msg_id,
        "role": role,
        "content": content.strip(),
        "tokens": tokens,
        "timestamp": int(time.time())
    })

    try:
        key = _get_session_key(session_id)

        # Atomic Redis Pipeline: Push -> Trim -> Sliding TTL Expiration
        pipe = r.pipeline()
        pipe.rpush(key, payload)
        pipe.ltrim(key, -MAX_RAW_BUFFER_MESSAGES, -1)
        pipe.expire(key, ttl_seconds)  # 👈 Resets 2-hour sliding window countdown
        
        if hasattr(pipe, "exec"):
            await pipe.exec()
        else:
            await pipe.execute()
    except Exception as e:
        print(f"⚠️ Session store write warning ({e})")


async def clear_session(session_id: str) -> bool:
    """
    Clears the conversation session memory and summary in both Redis and SQLite.
    """
    if not session_id:
        return False

    # 1. Clear Redis cache keys
    r = await get_redis_client()
    if r:
        try:
            key = _get_session_key(session_id)
            summary_key = _get_summary_key(session_id)
            id_key = _get_last_summarized_id_key(session_id)
            await r.delete(key, summary_key, id_key)
        except Exception as e:
            print(f"⚠️ Session store clear warning ({e})")

    # 2. Clear SQLite permanent summary
    try:
        from gateway.identity import save_conversation_summary
        save_conversation_summary(session_id, "")
    except Exception:
        pass

    return True
