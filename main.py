import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any

# LangChain universal Chat Models
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

# API Gateway & Identity layer (Auth, SQLite DB, Redis Rate Limiter, Credit Wallets)
from gateway.identity import (
    verify_api_gateway,
    create_api_key,
    recharge_key,
    deduct_usage_cost
)

# 01 Input Guardrails (Microsoft Presidio PII Masking & Meta Llama Guard 3)
from guardrails.input_guard import apply_input_guardrails

# 03 Semantic Cache (Redis Cosine Similarity Engine)
from cache.semantic_cache import check_semantic_cache, save_to_semantic_cache

# Orchestrator & Layer B (Router 04, Model Gateway 07, HITL 08, RAG 05)
from orchestrator.router import orchestrate_request
from orchestrator.hitl import list_pending_tickets, review_ticket
from orchestrator.rag import ingest_temporary_knowledge
from orchestrator.model_gateway import calculate_token_cost

load_dotenv()

app = FastAPI(
    title="AI Inference Platform Gateway",
    description="Mini-OpenRouter Architecture with Redis Rate Limiting & Credit Wallets",
    version="1.0.0"
)

# --- REQUEST & RESPONSE SCHEMAS ---

class PromptRequest(BaseModel):
    prompt: str
    provider: Optional[str] = "groq"  # "groq", "openai", "gemini"
    context: Optional[str] = None  # Optional inline lines of information (stored 2 hours)

class IngestKnowledgeRequest(BaseModel):
    text: str
    source_name: Optional[str] = "user_document"

class KeyCreateRequest(BaseModel):
    name: str = "My Project"
    starter_credits: float = 5.0
    rpm_limit: int = 30

class RechargeRequest(BaseModel):
    key: str
    amount_usd: float

class TicketReviewRequest(BaseModel):
    decision: str  # "approved" or "rejected"
    reviewer_name: Optional[str] = "Human Supervisor"


# --- MODEL SELECTOR ---

def get_model(provider: str):
    if provider == "groq":
        return ChatGroq(model="llama-3.3-70b-versatile", api_key=os.getenv("GROQ_API_KEY"))
    elif provider == "openai":
        return ChatOpenAI(model="gpt-4o-mini", api_key=os.getenv("OPENAI_API_KEY"))
    elif provider == "gemini":
        return ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=os.getenv("GOOGLE_API_KEY"))
    else:
        raise HTTPException(status_code=400, detail=f"Invalid provider '{provider}'. Choose 'groq', 'openai', or 'gemini'.")


# --- GATEWAY & WALLET MANAGEMENT ENDPOINTS ---

@app.get("/")
def root():
    return {
        "service": "AI Inference Platform Gateway",
        "status": "online",
        "architecture_layer": "02 API Gateway + Identity",
        "rate_limiter": "Redis (Sliding Window ZSET)",
        "docs": "/docs"
    }


@app.post("/v1/keys/create")
def generate_api_key(req: KeyCreateRequest):
    """
    Developer registers and receives their platform API key.
    Comes with starter credits (default $5.00) and Redis RPM limits.
    """
    return create_api_key(
        name=req.name,
        starter_credits=req.starter_credits,
        rpm_limit=req.rpm_limit
    )


@app.post("/v1/keys/recharge")
def topup_credits(req: RechargeRequest):
    """
    Recharge an API key's balance when credits run out.
    """
    return recharge_key(raw_key_or_prefix=req.key, amount_usd=req.amount_usd)


@app.get("/v1/keys/balance")
async def check_balance(client_info: Dict[str, Any] = Depends(verify_api_gateway)):
    """
    Check current remaining balance, total spent, and limits.
    Requires: Authorization: Bearer <sk-live-...>
    """
    return {
        "key_prefix": client_info["key_prefix"],
        "name": client_info["name"],
        "balance_usd": client_info["balance_usd"],
        "total_spent_usd": client_info["total_spent_usd"],
        "rpm_limit": client_info["rpm_limit"]
    }


# --- 08 HUMAN IN THE LOOP (REVIEW & AUDIT ENDPOINTS) ---

@app.get("/v1/hitl/tickets/pending")
def get_pending_human_tickets():
    """
    08 Human in the Loop:
    List all high-risk requests pending human approval.
    """
    return list_pending_tickets()


@app.post("/v1/hitl/tickets/{ticket_id}/review")
def review_human_ticket(ticket_id: str, req: TicketReviewRequest):
    """
    08 Human in the Loop:
    Supervisor approves or rejects an escalated ticket.
    """
    return review_ticket(
        ticket_id=ticket_id,
        decision=req.decision.lower(),
        reviewer_name=req.reviewer_name
    )


# --- 05 RETRIEVAL / RAG (2-HOUR TEMPORARY KNOWLEDGE INGESTION) ---

@app.post("/v1/rag/ingest")
async def ingest_knowledge_document(
    req: IngestKnowledgeRequest,
    client_info: Dict[str, Any] = Depends(verify_api_gateway)
):
    """
    05 Retrieval / RAG:
    Ingest documents or text lines into Redis with 2-hour TTL (7,200 seconds).
    Self-destructs automatically after 2 hours!
    """
    return await ingest_temporary_knowledge(
        text=req.text,
        source_name=req.source_name,
        ttl_seconds=7200
    )


# --- PROTECTED INFERENCE ENDPOINT ---

@app.post("/chat")
async def chat(
    req: PromptRequest,
    client_info: Dict[str, Any] = Depends(verify_api_gateway)  # 👈 GATEWAY INTERCEPTOR
):
    """
    Protected LLM Chat Endpoint:
    1. Authenticates Developer Key (SHA-256)
    2. Enforces Distributed Redis Sliding-Window Rate Limit
    3. Enforces Credit Balance ($0.00 check)
    4. Calls LLM & Deducts dynamic token usage cost
    """
    # 01 Input Guardrails: PII Masking (Presidio) & Content Safety Check (Meta Llama Guard 3)
    safe_prompt = await apply_input_guardrails(req.prompt)

    # 03 Semantic Cache: Check for >= 90% semantic match in Redis
    cached_result, prompt_vector = await check_semantic_cache(safe_prompt)
    if cached_result:
        # ⚡ CACHE HIT: Instant ~10ms return, $0.00 cost, skip LLM entirely!
        return {
            "provider": cached_result["provider"],
            "response": cached_result["response"],
            "cache": {
                "hit": True,
                "similarity_score": cached_result["similarity_score"],
                "cached_prompt": cached_result["cached_prompt"]
            },
            "billing": {
                "cost_usd": 0.0,
                "remaining_balance_usd": client_info["balance_usd"]
            }
        }

    # 04 Router + Orchestrator: Dispatches intent, selects model, and executes with fallback
    # 1. Fetch Model via Orchestrator
    # One unified call for ANY provider!
    orch_result = await orchestrate_request(
        prompt=safe_prompt, 
        requested_model=req.provider,
        inline_context=req.context
    )  # ainvoke => async invoke..

    # 08 Human in the Loop: If high-risk, return review ticket immediately!
    if orch_result.get("status") == "pending_human_approval":
        return {
            "status": "pending_human_approval",
            "intent": orch_result["intent"],
            "intent_confidence": orch_result.get("intent_confidence", 1.0),
            "intent_reasoning": orch_result.get("intent_reasoning", ""),
            "ticket_id": orch_result.get("ticket_id"),
            "action_taken": orch_result.get("action_taken"),
            "response": orch_result["response"],
            "billing": {
                "cost_usd": 0.0,
                "remaining_balance_usd": client_info["balance_usd"]
            }
        }

    answer_text = orch_result["response"]
    provider_used = orch_result["provider_used"]
    response_metadata = orch_result.get("response_metadata", {})

    # 03 Semantic Cache: Store (prompt, vector, answer) in Redis for future hits
    await save_to_semantic_cache(safe_prompt, prompt_vector, answer_text, provider_used)

    # 3. Dynamic Cost Calculation based on model-specific pricing catalog
    # (Default nominal cost $0.0001 or computed per provider rates)
    cost = 0.0001
    token_usage = response_metadata.get("token_usage", {})
    if token_usage:
        prompt_tokens = token_usage.get("prompt_tokens", 0)
        completion_tokens = token_usage.get("completion_tokens", 0)
        cost = calculate_token_cost(provider_used, prompt_tokens, completion_tokens)

    # 4. Atomically Deduct from Developer's SQLite Wallet
    remaining_balance = deduct_usage_cost(client_info["key_hash"], cost)

    return {
        "provider": provider_used,
        "intent": orch_result["intent"],
        "intent_confidence": orch_result.get("intent_confidence", 1.0),
        "intent_reasoning": orch_result.get("intent_reasoning", ""),
        "sources_used": orch_result.get("sources_used", []),
        "failover_triggered": orch_result["failover_triggered"],
        "response": answer_text,
        "token_usage": token_usage,
        "billing": {
            "cost_usd": cost,
            "remaining_balance_usd": remaining_balance
        }
    }
