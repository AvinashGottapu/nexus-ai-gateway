import os
import json
import uuid
from typing import List, Dict, Any, Optional, Union
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from gateway.identity import get_redis_client

# =====================================================================
# LAYER C: SESSION STORE (Per-User Conversation Memory with TTL)
# =====================================================================

# Automatic Session Expiration: 2 hours (7,200 seconds)
DEFAULT_SESSION_TTL = 7200
# Max messages to retain in active memory (e.g. 10 messages = 5 conversational turns)
MAX_HISTORY_MESSAGES = 10


def generate_session_id() -> str:
    """Generates a clean, unique session identifier for new conversations."""
    return f"sess_{uuid.uuid4().hex[:12]}"


def _get_session_key(session_id: str) -> str:
    return f"session:{session_id}:messages"


async def get_session_messages(session_id: str, max_messages: int = MAX_HISTORY_MESSAGES) -> List[Dict[str, str]]:
    """
    Retrieves the raw JSON message history from Redis:
    [
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."}
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
            return []

        messages = []
        for item in raw_items:
            try:
                messages.append(json.loads(item))
            except Exception:
                continue
        return messages
    except Exception as e:
        print(f"⚠️ Session store read error ({e})")
        return []


async def get_session_langchain_messages(
    session_id: str, 
    max_messages: int = MAX_HISTORY_MESSAGES
) -> List[BaseMessage]:
    """
    Converts Redis JSON conversation history into native LangChain Message objects:
    - role 'user'      -> HumanMessage
    - role 'assistant' -> AIMessage
    - role 'system'    -> SystemMessage
    """
    json_messages = await get_session_messages(session_id, max_messages=max_messages)
    langchain_messages: List[BaseMessage] = []

    for msg in json_messages:
        role = msg.get("role", "").lower()
        content = msg.get("content", "")

        if role == "user":
            langchain_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            langchain_messages.append(AIMessage(content=content))
        elif role == "system":
            langchain_messages.append(SystemMessage(content=content))

    return langchain_messages


async def append_session_message(
    session_id: str,
    role: str,
    content: str,
    ttl_seconds: int = DEFAULT_SESSION_TTL
) -> None:
    """
    Appends a new turn to the user's session in Redis.
    - Limits total list length to MAX_HISTORY_MESSAGES (sliding window).
    - Automatically refreshes the 2-hour TTL timer with every new message.
    """
    if not session_id or not content.strip():
        return

    r = await get_redis_client()
    if not r:
        return

    try:
        key = _get_session_key(session_id)
        payload = json.dumps({"role": role, "content": content.strip()})

        # Pipeline: Push -> Trim -> Refresh TTL
        pipe = r.pipeline()
        pipe.rpush(key, payload)
        pipe.ltrim(key, -MAX_HISTORY_MESSAGES, -1)  # Keep only recent sliding window
        pipe.expire(key, ttl_seconds)                # Reset 2-hour TTL
        if hasattr(pipe, "exec"):
            await pipe.exec()
        else:
            await pipe.execute()
    except Exception as e:
        print(f"⚠️ Session store write error ({e})")


async def clear_session(session_id: str) -> bool:
    """
    Clears the conversation session if the user clicks 'New Chat' or resets.
    """
    if not session_id:
        return False

    r = await get_redis_client()
    if not r:
        return False

    try:
        key = _get_session_key(session_id)
        await r.delete(key)
        return True
    except Exception as e:
        print(f"⚠️ Session store clear error ({e})")
        return False
