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

# 04 Router & Orchestrator (Intent, Model Selection & Fallback)
from router.orchestrator import orchestrate_request

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

class KeyCreateRequest(BaseModel):
    name: str = "My Project"
    starter_credits: float = 5.0
    rpm_limit: int = 30

class RechargeRequest(BaseModel):
    key: str
    amount_usd: float


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
    orch_result = await orchestrate_request(safe_prompt, req.provider)  # ainvoke => async invoke..

    answer_text = orch_result["response"]
    provider_used = orch_result["provider_used"]
    response_metadata = orch_result.get("response_metadata", {})

    # 03 Semantic Cache: Store (prompt, vector, answer) in Redis for future hits
    await save_to_semantic_cache(safe_prompt, prompt_vector, answer_text, provider_used)

    # 3. Dynamic Cost Calculation based on token usage
    # (Default nominal cost $0.0002 or extracted from response_metadata)
    cost = 0.0002
    token_usage = response_metadata.get("token_usage", {})
    if token_usage:
        prompt_tokens = token_usage.get("prompt_tokens", 0)
        completion_tokens = token_usage.get("completion_tokens", 0)
        # Standard blending rate (~$0.50/M prompt, ~$1.00/M completion)
        cost = round((prompt_tokens * 0.0000005) + (completion_tokens * 0.0000010), 6)
        if cost == 0:
            cost = 0.0001

    # 4. Atomically Deduct from Developer's SQLite Wallet
    remaining_balance = deduct_usage_cost(client_info["key_hash"], cost)

    return {
        "provider": provider_used,
        "intent": orch_result["intent"],
        "failover_triggered": orch_result["failover_triggered"],
        "response": answer_text,
        "token_usage": token_usage,
        "billing": {
            "cost_usd": cost,
            "remaining_balance_usd": remaining_balance
        }
    }
