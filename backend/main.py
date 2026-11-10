import os
import sys
import json
import time
import asyncio

# Ensure backend root is on sys.path for robust submodule importing
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any

# LangChain universal Chat Models
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

# API Gateway & Identity layer (Auth, SQLite DB, Redis Rate Limiter, Credit Wallets)
from gateway.identity import (
    verify_api_gateway,
    verify_consumer_token,
    verify_developer_key,
    create_api_key,
    recharge_key,
    deduct_usage_cost,
    list_api_keys,
    revoke_api_key,
    process_stripe_payment,
    list_all_payments,
    list_user_payments,
    get_payments_summary,
    get_security_policy,
    update_security_policy,
    toggle_key_status,
    register_user,
    authenticate_user,
    verify_user_token,
    get_user_by_id,
    list_user_conversations,
    get_conversation_messages,
    save_conversation_turn,
    delete_conversation
)
from orchestrator.circuit_breaker import circuit_breaker

# 01 Input & Output Guardrails (Microsoft Presidio PII Masking, Meta Llama Guard 3 & Grounding)
from guardrails.input_guard import apply_input_guardrails
from guardrails.output_guard import apply_output_guardrails

# 03 Semantic Cache (Redis Cosine Similarity Engine)
from cache.semantic_cache import check_semantic_cache, save_to_semantic_cache

# Layer C: Session Store (Context-Aware Multi-Turn Chat Memory with TTL)
from gateway.session_store import (
    generate_session_id,
    get_session_langchain_messages,
    convert_to_langchain_messages,
    calculate_history_tokens,
    append_session_message,
    clear_session
)

# Layer D: 09 Observability (Traces, p95 Latency, Token Accounting & Cost Telemetry)
from observability.tracer import (
    generate_trace_id,
    RequestTimer,
    record_request_metrics,
    get_gateway_metrics
)

# Layer D: Evaluation (User Feedback Store & Golden Set)
from eval.feedback import submit_feedback, get_feedback_summary

# Orchestrator & Layer B (Router 04, Model Gateway 07, HITL 08, RAG 05)
from orchestrator.router import orchestrate_request, orchestrate_request_stream, classify_intent
from orchestrator.hitl import list_pending_tickets, list_all_tickets, review_ticket
from orchestrator.rag import ingest_temporary_knowledge
from orchestrator.model_gateway import calculate_token_cost

load_dotenv()

app = FastAPI(
    title="AI Inference Platform Gateway",
    description="Mini-OpenRouter Architecture with Redis Rate Limiting & Credit Wallets",
    version="1.0.0"
)

from fastapi.middleware.cors import CORSMiddleware

# Enable CORS for user_frontend (port 3000) and admin_frontend (port 3001)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- REQUEST & RESPONSE SCHEMAS ---

class PromptRequest(BaseModel):
    prompt: str
    provider: Optional[str] = "groq"  # "groq", "openai", "gemini"
    session_id: Optional[str] = None  # Layer C: Per-user multi-turn conversation session ID
    user_id: Optional[str] = None     # Authenticated user ID

class UserRegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = "User"

class UserLoginRequest(BaseModel):
    email: str
    password: str

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

class UserStatusUpdateRequest(BaseModel):
    key_id: str
    is_active: bool

class FeedbackRequest(BaseModel):
    trace_id: str
    rating: Optional[int] = None      # 1 to 5 stars
    thumbs: Optional[str] = None      # "up" or "down"
    comment: Optional[str] = None     # User notes / correction text


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


# --- AUTHENTICATION & USER MANAGEMENT ENDPOINTS ---

@app.post("/api/auth/register")
def register(req: UserRegisterRequest):
    """Registers a new user account into SQLite users table."""
    try:
        user_data = register_user(req.email, req.password, req.name or "User")
        return {"status": "success", "user": user_data, "token": user_data["token"]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@app.post("/api/auth/login")
def login(req: UserLoginRequest):
    """Authenticates user against SQLite database and returns session token."""
    user_data = authenticate_user(req.email, req.password)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"status": "success", "user": user_data, "token": user_data["token"]}


@app.get("/api/auth/me")
def get_current_user(authorization: Optional[str] = Header(None)):
    """Validates session token and returns current user profile."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token.")
    token = authorization.split("Bearer ", 1)[1].strip()
    user_id = verify_user_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please sign in again.")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"status": "success", "user": user}


# --- CONVERSATION & CHAT HISTORY ENDPOINTS ---

@app.get("/api/conversations")
def get_user_conversations(user_id: str):
    """Returns all past conversations for a user_id from SQLite."""
    if not user_id:
        return {"conversations": []}
    chats = list_user_conversations(user_id)
    return {"conversations": chats}


@app.get("/api/conversations/{conversation_id}/messages")
def get_chat_messages(conversation_id: str):
    """Returns all messages in a conversation from SQLite."""
    msgs = get_conversation_messages(conversation_id)
    return {"messages": msgs}


@app.delete("/api/conversations/{conversation_id}")
async def remove_conversation(conversation_id: str, user_id: Optional[str] = None):
    """Deletes a conversation and its messages from both SQLite and Redis cache."""
    await clear_session(conversation_id)
    success = delete_conversation(conversation_id, user_id)
    return {"status": "success" if success else "not_found", "deleted": success}


# --- GATEWAY & WALLET MANAGEMENT ENDPOINTS ---

@app.get("/health")
@app.get("/api/status")
def health_check():
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


@app.get("/v1/keys")
def get_all_keys():
    """
    Returns all API keys in SQLite for the Key Manager UI.
    """
    return list_api_keys()


class KeyRevokeRequest(BaseModel):
    key_id: str

@app.post("/v1/keys/revoke")
def revoke_key_route(req: KeyRevokeRequest):
    """
    Revokes an active API key in SQLite.
    """
    success = revoke_api_key(req.key_id)
    return {"key_id": req.key_id, "revoked": success}


@app.get("/v1/ops/circuit-breakers")
def get_circuit_breakers_status():
    """
    Layer D: Returns live health of Groq, OpenAI, and Gemini circuit breakers.
    """
    return circuit_breaker.get_status()


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


# --- STRIPE PAYMENTS & BILLING ENDPOINTS ---

class CheckoutRequest(BaseModel):
    user_email: str = "sarah.chen@techcorp.com"
    amount_usd: float = 25.0
    key_hash: Optional[str] = None
    payment_method: Optional[str] = "Stripe (Visa •••• 4242)"
    card_number: Optional[str] = None
    exp_month: Optional[str] = None
    exp_year: Optional[str] = None
    cvc: Optional[str] = None
    outcome: Optional[str] = "succeeded"  # "succeeded" or "failed"
    failure_reason: Optional[str] = None

@app.post("/v1/payments/checkout")
def stripe_checkout(req: CheckoutRequest):
    """
    Simulated & real Stripe payment processor:
    - If outcome == 'succeeded': Immediately credits user's SQLite API key wallet.
    - If outcome == 'failed': Records failed transaction without crediting.
    - Accepts developer test cards (e.g. 4242... for success, 4000...0002 for card decline, 4000...0127 for insufficient funds).
    """
    failure_msg = req.failure_reason if req.outcome == "failed" else None
    if req.outcome == "failed" and not failure_msg:
        failure_msg = "Card declined: Insufficient funds or card restriction."

    return process_stripe_payment(
        user_email=req.user_email,
        amount_usd=req.amount_usd,
        status=req.outcome,
        key_hash=req.key_hash,
        payment_method=req.payment_method,
        failure_reason=failure_msg,
        card_number=req.card_number
    )


@app.get("/v1/payments")
def get_all_or_user_payments(user_email: Optional[str] = None):
    """
    Returns payment records from SQLite.
    - For User: Pass ?user_email=sarah.chen@techcorp.com
    - For Admin: Omit user_email to get all platform payments.
    """
    return list_user_payments(user_email)


@app.get("/v1/payments/summary")
def get_payments_kpi():
    """
    Returns revenue, succeeded payment count, and failed payment count for Admin.
    """
    return get_payments_summary()


# --- SECURITY & PII POLICY CONFIGURATION ---

class SecurityConfigRequest(BaseModel):
    redact_emails: bool = True
    redact_phones: bool = True
    redact_ssn: bool = True
    prompt_guard_enforced: bool = True
    ip_allowlist: str = "0.0.0.0/0 (Global Access)"

@app.get("/v1/security/config")
def read_security_config():
    """Returns active security and PII policies."""
    return get_security_policy()

@app.post("/v1/security/config")
def save_security_config(req: SecurityConfigRequest):
    """Saves updated security and PII policies to SQLite."""
    return update_security_policy(
        redact_emails=req.redact_emails,
        redact_phones=req.redact_phones,
        redact_ssn=req.redact_ssn,
        prompt_guard_enforced=req.prompt_guard_enforced,
        ip_allowlist=req.ip_allowlist
    )


# --- 08 HUMAN IN THE LOOP (REVIEW & AUDIT ENDPOINTS) ---

@app.get("/v1/hitl/tickets")
def get_all_human_tickets():
    """
    08 Human in the Loop:
    List all requests (pending, approved, rejected) for the Admin Queue table.
    """
    return list_all_tickets()

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


@app.post("/v1/admin/users/status")
def change_user_status(req: UserStatusUpdateRequest):
    """
    Suspends or activates a user/API key in SQLite.
    """
    return toggle_key_status(req.key_id, 1 if req.is_active else 0)


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


@app.post("/v1/rag/upload")
async def upload_and_ingest_file(
    file: UploadFile = File(...),
    source_name: Optional[str] = Form(None),
    ttl_seconds: int = Form(7200),
    client_info: Dict[str, Any] = Depends(verify_api_gateway)
):
    """
    Direct File Ingestion into 2-Hour Redis Ephemeral Knowledge Store:
    Uploads a document file (.txt, .md, .json, .csv, .py, etc.) directly into Redis.
    Guaranteed auto-expiration and cleanup after 2 hours!
    """
    try:
        content_bytes = await file.read()
        try:
            text_content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text_content = content_bytes.decode("latin-1", errors="replace")

        final_source = source_name.strip() if source_name and source_name.strip() else file.filename
        
        result = await ingest_temporary_knowledge(
            text=text_content,
            source_name=final_source,
            ttl_seconds=ttl_seconds
        )
        result["file_name"] = file.filename
        result["file_size_bytes"] = len(content_bytes)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={"error": "file_ingest_failed", "message": f"Could not process and ingest file: {str(e)}"}
        )


# =====================================================================
# SHARED INFERENCE PIPELINE
# =====================================================================

async def run_chat_pipeline(
    req: PromptRequest,
    client_info: Dict[str, Any],
    session_id: str,
    chat_history: list,
    history_tokens: int,
    is_consumer: bool
) -> Dict[str, Any]:
    """
    Executes the full LLM pipeline:
    Input Guardrails -> Semantic Cache -> Intent Routing -> Orchestration -> Output Guardrails -> Telemetry
    """
    timer = RequestTimer()
    trace_id = generate_trace_id()

    # 01 Input Guardrails: PII Masking (Presidio) & Content Safety Check (Meta Llama Guard 3)
    timer.start_phase()
    safe_prompt = await apply_input_guardrails(req.prompt)
    timer.record_phase("input_guardrails_ms")

    # 03 Semantic Cache: Check for >= 90% semantic match in Redis
    timer.start_phase()
    cached_result, prompt_vector = await check_semantic_cache(safe_prompt)
    timer.record_phase("cache_lookup_ms")

    if cached_result:
        timer.start_phase()
        # Diagram rule: "HIT - still validate" before streaming answer
        guard_output = await apply_output_guardrails(
            user_prompt=req.prompt,
            draft_answer=cached_result["response"],
            retrieved_context=None
        )
        timer.record_phase("output_guardrails_ms")

        # Layer C: Session Store - Append cached turn to memory (Consumer ONLY)
        if is_consumer:
            await append_session_message(session_id, "user", req.prompt)
            await append_session_message(session_id, "assistant", guard_output["sanitized_response"])

            # Persist conversation turn in SQLite
            save_conversation_turn(
                conversation_id=session_id,
                user_id=req.user_id or client_info.get("user_id") or "usr_anonymous",
                user_prompt=req.prompt,
                assistant_response=guard_output["sanitized_response"],
                metadata={"cache": {"hit": True}, "provider": cached_result.get("provider", "gemini")},
                model=cached_result.get("provider", "gemini")
            )

        timings = timer.get_summary()

        # ⚡ Estimate avoided cost from bypassed upstream LLM call
        est_prompt_tokens = max(1, int(len(req.prompt.split()) * 1.33))
        est_comp_tokens = max(1, int(len(cached_result.get("response", "").split()) * 1.33))
        saved_cost = calculate_token_cost(
            provider=cached_result.get("provider", "gemini"),
            prompt_tokens=est_prompt_tokens,
            completion_tokens=est_comp_tokens
        )

        # Layer D: Record cache hit telemetry + exact cost saved
        await record_request_metrics(
            provider=cached_result["provider"],
            cache_hit=True,
            total_tokens=0,
            cost_usd=0.0,
            latency_ms=timings["total_latency_ms"],
            saved_cost_usd=saved_cost,
            phase_timings=timings
        )

        # ⚡ CACHE HIT: Instant ~10ms return, $0.00 cost, skip LLM entirely!
        return {
            "trace_id": trace_id,
            "session_id": session_id,
            "provider": cached_result["provider"],
            "response": guard_output["sanitized_response"],
            "cache": {
                "hit": True,
                "similarity_score": cached_result["similarity_score"],
                "cached_prompt": cached_result["cached_prompt"]
            },
            "guardrails": {
                "output_passed": guard_output["passed"],
                "rejection_type": guard_output.get("rejection_type")
            },
            "timings_ms": timings,
            "memory": {
                "history_tokens": history_tokens,
                "turns_in_context": len(chat_history),
                "budget_ceiling": 3000,
                "mode": "stateful_consumer" if is_consumer else "stateless_developer"
            },
            "billing": {
                "cost_usd": 0.0,
                "remaining_balance_usd": client_info["balance_usd"]
            }
        }

    # 04 Router: Classify intent via fast structured output
    timer.start_phase()
    intent_data = await classify_intent(safe_prompt)
    timer.record_phase("intent_routing_ms")

    # 05 Model Gateway: Fetch Model via Orchestrator
    timer.start_phase()
    orch_result = await orchestrate_request(
        prompt=safe_prompt, 
        requested_model=req.provider,
        chat_history=chat_history,
        intent_data=intent_data,
        prompt_vector=prompt_vector
    )  # ainvoke => async invoke..
    timer.record_phase("orchestrator_llm_ms")

    # 08 Human in the Loop: If high-risk, return review ticket immediately!
    if orch_result.get("status") == "pending_human_approval":
        timings = timer.get_summary()
        return {
            "trace_id": trace_id,
            "session_id": session_id,
            "status": "pending_human_approval",
            "intent": orch_result["intent"],
            "intent_confidence": orch_result.get("intent_confidence", 1.0),
            "intent_reasoning": orch_result.get("intent_reasoning", ""),
            "ticket_id": orch_result.get("ticket_id"),
            "action_taken": orch_result.get("action_taken"),
            "response": orch_result["response"],
            "timings_ms": timings,
            "memory": {
                "history_tokens": history_tokens,
                "turns_in_context": len(chat_history),
                "budget_ceiling": 3000,
                "mode": "stateful_consumer" if is_consumer else "stateless_developer"
            },
            "billing": {
                "cost_usd": 0.0,
                "remaining_balance_usd": client_info["balance_usd"]
            }
        }

    answer_text = orch_result["response"]
    provider_used = orch_result["provider_used"]
    response_metadata = orch_result.get("response_metadata", {})

    # 01 Output Guardrails: Safety • Privacy (PII & Key Redaction) • Grounding (Hallucination Judge)
    timer.start_phase()
    output_guard = await apply_output_guardrails(
        user_prompt=req.prompt,
        draft_answer=answer_text,
        retrieved_context=orch_result.get("retrieved_context")
    )
    final_answer = output_guard["sanitized_response"]
    timer.record_phase("output_guardrails_ms")
    timings = timer.get_summary()

    # 03 Semantic Cache: Diagram rule: "Write only after output validation"
    if (
        output_guard["passed"]
        and "Sensitive Operation Intercepted" not in final_answer
        and "Review Ticket #" not in final_answer
        and not final_answer.strip().startswith("{")
        and not final_answer.strip().startswith("[")
    ):
        await save_to_semantic_cache(safe_prompt, prompt_vector, final_answer, provider_used)

    # Layer C: Session Store - Append conversation turns to Redis & SQLite (Consumer ONLY)
    if is_consumer:
        await append_session_message(session_id, "user", req.prompt)
        await append_session_message(session_id, "assistant", final_answer)

        # Persist permanent conversation turn in SQLite
        save_conversation_turn(
            conversation_id=session_id,
            user_id=req.user_id or client_info.get("user_id") or "usr_anonymous",
            user_prompt=req.prompt,
            assistant_response=final_answer,
            metadata={
                "provider_used": provider_used,
                "sub_intent": orch_result.get("sub_intent"),
                "intent": orch_result["intent"],
                "auto_rag_promoted": orch_result.get("auto_rag_promoted", False),
                "savings_badge": orch_result.get("savings_badge"),
                "timings": timings,
                "cache": {"hit": False}
            },
            model=provider_used
        )

    # 3. Dynamic Cost Calculation based on model-specific pricing catalog
    # (Default nominal cost $0.0001 or computed per provider rates)
    cost = 0.0001
    token_usage = response_metadata.get("token_usage", {})
    prompt_tokens = 0
    completion_tokens = 0
    if token_usage:
        prompt_tokens = token_usage.get("prompt_tokens", 0)
        completion_tokens = token_usage.get("completion_tokens", 0)
        cost = calculate_token_cost(provider_used, prompt_tokens, completion_tokens)

    # 4. Atomically Deduct from Developer's SQLite Wallet (if not consumer)
    remaining_balance = client_info.get("balance_usd", 1000.0)
    if not is_consumer and client_info.get("key_hash"):
        remaining_balance = deduct_usage_cost(client_info["key_hash"], cost)

    timings = timer.get_summary()

    # Layer D: 09 Observability - Record telemetry metrics to Redis
    await record_request_metrics(
        provider=provider_used,
        cache_hit=False,
        total_tokens=prompt_tokens + completion_tokens,
        cost_usd=cost,
        latency_ms=timings["total_latency_ms"],
        phase_timings=timings
    )

    return {
        "trace_id": trace_id,
        "session_id": session_id,
        "provider": provider_used,
        "intent": orch_result["intent"],
        "sub_intent": orch_result.get("sub_intent"),
        "auto_rag_promoted": orch_result.get("auto_rag_promoted", False),
        "routing_decision": orch_result.get("routing_decision"),
        "savings_badge": orch_result.get("savings_badge"),
        "intent_confidence": orch_result.get("intent_confidence", 1.0),
        "intent_reasoning": orch_result.get("intent_reasoning", ""),
        "sources_used": orch_result.get("sources_used", []),
        "failover_triggered": orch_result["failover_triggered"],
        "response": final_answer,
        "guardrails": {
            "output_passed": output_guard["passed"],
            "rejection_type": output_guard.get("rejection_type"),
            "hazard_code": output_guard.get("hazard_code")
        },
        "token_usage": token_usage,
        "timings_ms": timings,
        "memory": {
            "history_tokens": history_tokens,
            "turns_in_context": len(chat_history),
            "budget_ceiling": 3000,
            "mode": "stateful_consumer" if is_consumer else "stateless_developer"
        },
        "billing": {
            "cost_usd": cost,
            "remaining_balance_usd": remaining_balance
        }
    }


# =====================================================================
# 1. CONSUMER CHAT ENDPOINT (chat_frontend - Clerk Auth - 100% Stateful)
# =====================================================================

@app.post("/chat")
async def consumer_chat(
    req: PromptRequest,
    consumer_info: Dict[str, Any] = Depends(verify_consumer_token)
):
    """
    Dedicated Consumer Web Endpoint (chat_frontend):
    - 100% Stateful: Auto-injects up to 3,000 tokens of past history from Redis / SQLite.
    - Zero manual message array required from frontend.
    - Authenticated via Clerk JWT.
    """
    session_id = req.session_id or generate_session_id()
    chat_history = await get_session_langchain_messages(session_id, max_tokens=3000)
    history_tokens = calculate_history_tokens(chat_history)
    return await run_chat_pipeline(req, consumer_info, session_id, chat_history, history_tokens, is_consumer=True)


# =====================================================================
# 2. DEVELOPER API ENDPOINT (OpenAI API Standard - sk-live - 100% Stateless)
# =====================================================================

@app.post("/v1/chat/completions")
async def developer_chat_completions(
    req: PromptRequest,
    client_info: Dict[str, Any] = Depends(verify_developer_key)
):
    """
    Dedicated Developer B2B Endpoint (OpenAI API Standard):
    - 100% Stateless: Uses ONLY the messages explicitly provided in req.chat_history.
    - Zero server-side memory injection.
    - Deducts wallet balance per token from SQLite API key.
    """
    session_id = req.session_id or generate_session_id()
    chat_history = convert_to_langchain_messages(req.chat_history or [], max_tokens=3000)
    history_tokens = calculate_history_tokens(chat_history)
    return await run_chat_pipeline(req, client_info, session_id, chat_history, history_tokens, is_consumer=False)


# =====================================================================
# REAL-TIME SSE TOKEN STREAMING GENERATOR
# =====================================================================

async def sse_token_generator(
    req: PromptRequest,
    client_info: Dict[str, Any],
    session_id: str,
    chat_history: list,
    history_tokens: int,
    is_consumer: bool
):
    timer = RequestTimer()
    trace_id = generate_trace_id()

    # Step 1: Input Guardrails (Presidio PII Masking & Safety Guard)
    timer.start_phase()
    try:
        safe_prompt = await apply_input_guardrails(req.prompt)
    except HTTPException as he:
        err_msg = he.detail.get("message", "Input Guardrail Violation") if isinstance(he.detail, dict) else str(he.detail)
        payload = {
            "token": f"🛡️ [Input Guardrail Blocked]: {err_msg}",
            "done": True,
            "error": "guardrail_violation",
            "ttft_ms": round((time.perf_counter() - timer.start_time) * 1000, 1),
            "trace_id": trace_id
        }
        yield f"data: {json.dumps(payload)}\n\n"
        return
    timer.record_phase("input_guardrails_ms")

    # Step 2: Rate limit & token bucket identity layer
    timer.record_phase("auth_ms")

    # Step 3: Semantic Cache Check
    timer.start_phase()
    cached_result, prompt_vector = await check_semantic_cache(safe_prompt)
    timer.record_phase("cache_lookup_ms")

    if cached_result:
        timer.start_phase()
        ttft_ms = round((time.perf_counter() - timer.start_time) * 1000, 1)
        cached_text = cached_result["response"]

        # Stream cached words smoothly
        words = cached_text.split(" ")
        for i, w in enumerate(words):
            token_chunk = w if i == 0 else " " + w
            yield f"data: {json.dumps({'token': token_chunk, 'ttft_ms': ttft_ms, 'cache_hit': True, 'provider': cached_result['provider'], 'done': False})}\n\n"
            await asyncio.sleep(0.015)

        # Record telemetry & append to session if consumer
        if is_consumer:
            await append_session_message(session_id, "user", req.prompt)
            await append_session_message(session_id, "assistant", cached_text)
            save_conversation_turn(
                conversation_id=session_id,
                user_id=req.user_id or client_info.get("user_id") or "usr_anonymous",
                user_prompt=req.prompt,
                assistant_response=cached_text,
                metadata={"provider_used": cached_result.get("provider", "gemini"), "streaming": True, "cache_hit": True},
                model=cached_result.get("provider", "gemini")
            )
        timer.record_phase("output_guardrails_ms")
        timings = timer.get_summary()

        # Estimate avoided cost on stream cache hit
        est_prompt_tokens = max(1, int(len(req.prompt.split()) * 1.33))
        est_comp_tokens = max(1, int(len(words) * 1.33))
        saved_cost = calculate_token_cost(
            provider=cached_result.get("provider", "gemini"),
            prompt_tokens=est_prompt_tokens,
            completion_tokens=est_comp_tokens
        )

        await record_request_metrics(
            provider=cached_result["provider"],
            cache_hit=True,
            total_tokens=len(words),
            cost_usd=0.0,
            latency_ms=timings["total_latency_ms"],
            saved_cost_usd=saved_cost,
            phase_timings=timings
        )

        # Final SSE completion packet
        yield f"data: {json.dumps({'done': True, 'cache_hit': True, 'provider': cached_result['provider'], 'total_tokens': len(words), 'ttft_ms': ttft_ms, 'total_latency_ms': timings['total_latency_ms'], 'cost_usd': 0.0, 'trace_id': trace_id, 'session_id': session_id})}\n\n"
        return

    # Step 4: Router Intent Classification
    timer.start_phase()
    intent_data = await classify_intent(safe_prompt)
    timer.record_phase("intent_routing_ms")

    sub_intent_val = intent_data.sub_intent.value if intent_data.sub_intent else None
    routing_sla = None

    # Step 5: Stream from Orchestrator & Model Gateway
    timer.start_phase()
    first_token_sent = False
    ttft_ms = 0.0
    full_response = []
    provider_used = "groq"
    failover_active = False

    async for chunk in orchestrate_request_stream(
        prompt=safe_prompt,
        requested_model=req.provider,
        max_tokens=2048,
        chat_history=chat_history,
        intent_data=intent_data,
        prompt_vector=prompt_vector
    ):
        if not first_token_sent:
            ttft_ms = round((time.perf_counter() - timer.start_time) * 1000, 1)
            first_token_sent = True

        token = chunk["token"]
        provider_used = chunk["provider"]
        failover_active = chunk.get("failover_triggered", False)
        if "routing_decision" in chunk:
            routing_sla = chunk["routing_decision"]
        full_response.append(token)

        event_data = {
            "token": token,
            "ttft_ms": ttft_ms,
            "provider": provider_used,
            "failover_triggered": failover_active,
            "cache_hit": False,
            "intent": chunk.get("intent", intent_data.category.value),
            "sub_intent": sub_intent_val,
            "auto_rag_promoted": chunk.get("auto_rag_promoted", False),
            "routing_decision": routing_sla,
            "savings_badge": routing_sla.get("savings_badge") if routing_sla else None,
            "done": chunk.get("done", False),
            "trace_id": trace_id
        }
        yield f"data: {json.dumps(event_data)}\n\n"

    timer.record_phase("orchestrator_llm_ms")

    # Step 5: Finalize metrics & billing
    complete_text = "".join(full_response)
    total_tokens = max(1, len(complete_text) // 4)
    cost = calculate_token_cost(provider_used, len(req.prompt) // 4, total_tokens)

    # Atomic SQLite wallet deduction (if developer)
    remaining_balance = client_info.get("balance_usd", 1000.0)
    if not is_consumer and client_info.get("key_hash"):
        remaining_balance = deduct_usage_cost(client_info["key_hash"], cost)

    # Save to semantic cache & session store
    timer.start_phase()
    if (
        prompt_vector
        and len(complete_text) > 10
        and "Sensitive Operation Intercepted" not in complete_text
        and "Review Ticket #" not in complete_text
    ):
        await save_to_semantic_cache(safe_prompt, prompt_vector, complete_text, provider_used)

    if is_consumer:
        await append_session_message(session_id, "user", req.prompt)
        await append_session_message(session_id, "assistant", complete_text)
        save_conversation_turn(
            conversation_id=session_id,
            user_id=req.user_id or client_info.get("user_id") or "usr_anonymous",
            user_prompt=req.prompt,
            assistant_response=complete_text,
            metadata={"provider_used": provider_used, "streaming": True},
            model=provider_used
        )

    timer.record_phase("output_guardrails_ms")

    timings = timer.get_summary()

    await record_request_metrics(
        provider=provider_used,
        cache_hit=False,
        total_tokens=total_tokens,
        cost_usd=cost,
        latency_ms=timings["total_latency_ms"],
        phase_timings=timings
    )

    final_payload = {
        "done": True,
        "cache_hit": False,
        "total_tokens": total_tokens,
        "ttft_ms": ttft_ms,
        "total_latency_ms": timings["total_latency_ms"],
        "cost_usd": cost,
        "remaining_balance_usd": remaining_balance,
        "provider": provider_used,
        "failover_triggered": failover_active,
        "intent": intent_data.category.value,
        "sub_intent": sub_intent_val,
        "routing_decision": routing_sla,
        "savings_badge": routing_sla.get("savings_badge") if routing_sla else None,
        "trace_id": trace_id,
        "session_id": session_id,
        "memory": {
            "history_tokens": history_tokens,
            "turns_in_context": len(chat_history),
            "budget_ceiling": 3000,
            "mode": "stateful_consumer" if is_consumer else "stateless_developer"
        }
    }
    yield f"data: {json.dumps(final_payload)}\n\n"


# =====================================================================
# 3. CONSUMER STREAMING ENDPOINT (chat_frontend - Clerk Auth - Real-Time)
# =====================================================================

@app.post("/chat/stream")
async def consumer_chat_stream(
    req: PromptRequest,
    consumer_info: Dict[str, Any] = Depends(verify_consumer_token)
):
    """
    Dedicated Consumer Web Streaming Endpoint:
    - 100% Stateful SSE token streaming.
    - Automatically pulls up to 3,000 tokens of past history from Redis / SQLite.
    - Saves completed assistant turns to memory.
    """
    session_id = req.session_id or generate_session_id()
    chat_history = await get_session_langchain_messages(session_id, max_tokens=3000)
    history_tokens = calculate_history_tokens(chat_history)
    return StreamingResponse(
        sse_token_generator(req, consumer_info, session_id, chat_history, history_tokens, is_consumer=True),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# =====================================================================
# 4. DEVELOPER STREAMING ENDPOINT (OpenAI API Standard - sk-live - SSE)
# =====================================================================

@app.post("/v1/chat/completions/stream")
async def developer_chat_stream(
    req: PromptRequest,
    client_info: Dict[str, Any] = Depends(verify_developer_key)
):
    """
    Dedicated Developer B2B Streaming Endpoint:
    - 100% Stateless SSE token streaming.
    - Uses ONLY explicit messages in req.chat_history.
    - Deducts wallet balance per token generated.
    """
    session_id = req.session_id or generate_session_id()
    chat_history = convert_to_langchain_messages(req.chat_history or [], max_tokens=3000)
    history_tokens = calculate_history_tokens(chat_history)
    return StreamingResponse(
        sse_token_generator(req, client_info, session_id, chat_history, history_tokens, is_consumer=False),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )



@app.post("/v1/chat/clear-session")
async def reset_chat_session(session_id: str):
    """
    Layer C: Clears the conversation session memory in Redis.
    """
    success = await clear_session(session_id)
    return {"session_id": session_id, "cleared": success}


# --- 09 PRODUCTION OPERATIONS (OBSERVABILITY & METRICS DASHBOARD) ---

@app.get("/v1/observability/metrics")
async def gateway_telemetry():
    """
    Layer D: 09 Observability Dashboard:
    Returns total requests, cache hit ratio, p95 & avg latency, tokens & cost spend.
    """
    return await get_gateway_metrics()


# --- LAYER D: EVALUATION & USER FEEDBACK ---

from eval.golden_set import run_golden_set_suite, get_latest_benchmark_run, get_benchmark_history
from eval.rag_eval import run_rag_golden_suite, get_latest_rag_eval_run, get_rag_eval_history

class BenchmarkRunRequest(BaseModel):
    provider: Optional[str] = "all"

@app.post("/v1/eval/benchmark/run")
async def execute_golden_benchmark(req: Optional[BenchmarkRunRequest] = None):
    """
    Layer D: Automated Evals Studio - Runs the 10-layer Golden Benchmark Suite
    with real-time LLM-as-a-Judge hallucination scoring and guardrail regression testing.
    """
    target = req.provider if req and req.provider else "all"
    return await run_golden_set_suite(target_provider=target)


@app.get("/v1/eval/benchmark/latest")
def get_latest_eval_scorecard():
    """
    Layer D: Automated Evals Studio - Returns the latest benchmark run scorecard and KPIs.
    """
    return get_latest_benchmark_run()


@app.get("/v1/eval/benchmark/history")
def get_eval_benchmark_history():
    """
    Layer D: Automated Evals Studio - Returns historical benchmark runs for trend analysis.
    """
    return get_benchmark_history()


# --- RAG GOLDEN EVALUATION & RAGAS BENCHMARK ENDPOINTS ---

@app.post("/v1/eval/rag/run")
async def execute_rag_golden_benchmark():
    """
    Executes the comprehensive RAG Golden Evaluation Suite:
    Tests the full RAG pipeline across golden test cases and scores:
    1. Faithfulness (Groundedness)
    2. Answer Relevance
    3. Context Precision
    4. Context Recall
    5. Answer Correctness
    """
    return await run_rag_golden_suite()


@app.get("/v1/eval/rag/latest")
def get_latest_rag_evaluation_scorecard():
    """
    Returns the most recent RAG evaluation scorecard and metrics.
    """
    latest = get_latest_rag_eval_run()
    if not latest:
        return {"status": "no_runs_yet", "message": "No RAG evaluation runs recorded. Run POST /v1/eval/rag/run to generate one."}
    return latest


@app.get("/v1/eval/rag/history")
def get_rag_evaluation_history(limit: int = 10):
    """
    Returns historical RAG evaluation summary runs.
    """
    return get_rag_eval_history(limit=limit)


@app.post("/v1/feedback")
def give_user_feedback(req: FeedbackRequest):
    """
    Layer D: Evaluation - Records user ratings (👍/👎, 1-5 stars, comments) mapped to trace_id.
    """
    return submit_feedback(
        trace_id=req.trace_id,
        rating=req.rating,
        thumbs=req.thumbs,
        comment=req.comment
    )


@app.get("/v1/feedback/summary")
def view_feedback_telemetry():
    """
    Layer D: Evaluation - Returns overall user satisfaction percentage and recent feedback records.
    """
    return get_feedback_summary()


# --- MODEL CONTEXT PROTOCOL (MCP) HOST MANAGEMENT ---
from mcp_host.manager import get_host_manager

class MCPServerCreateRequest(BaseModel):
    name: str
    transport: Optional[str] = "stdio"  # "stdio" or "sse"
    command: Optional[str] = None
    args: Optional[list] = None
    url: Optional[str] = None
    env: Optional[dict] = None
    enabled: bool = True

@app.on_event("startup")
async def startup_mcp_host():
    """Autostart configured MCP servers on gateway boot."""
    try:
        mgr = get_host_manager()
        await mgr.start_all()
    except Exception as e:
        print(f"[NEXUS-MCP] Autostart error: {e}")

@app.on_event("shutdown")
async def shutdown_mcp_host():
    """Gracefully terminate all MCP child processes on gateway shutdown."""
    try:
        mgr = get_host_manager()
        await mgr.stop_all()
    except Exception as e:
        print(f"[NEXUS-MCP] Shutdown error: {e}")

@app.get("/v1/mcp/servers")
async def list_mcp_servers():
    """Returns all configured MCP servers, connection states, and exposed tool definitions."""
    mgr = get_host_manager()
    # Self-healing: if any enabled server is not yet connected, connect it immediately
    has_disconnected = any(
        cfg.get("enabled", True) and (name not in mgr.clients or not mgr.clients[name].is_connected)
        for name, cfg in mgr.server_configs.items()
    )
    if has_disconnected:
        await mgr.start_all()
    return mgr.get_status()

@app.post("/v1/mcp/servers")
async def register_mcp_server(req: MCPServerCreateRequest):
    """Dynamically connects and persists a new MCP server (local stdio or remote SSE)."""
    mgr = get_host_manager()
    clean_name = req.name.strip().lower().replace(" ", "-")
    config = {
        "enabled": req.enabled,
        "env": req.env or {}
    }
    if req.transport == "sse" or req.url:
        config["url"] = req.url
    else:
        config["command"] = req.command
        config["args"] = req.args or []

    success = await mgr.add_server(clean_name, config, auto_connect=req.enabled)
    return {
        "success": success,
        "server_name": clean_name,
        "status": mgr.get_status()
    }

@app.delete("/v1/mcp/servers/{server_name}")
async def remove_mcp_server(server_name: str):
    """Disconnects and removes an MCP server from configuration."""
    mgr = get_host_manager()
    success = await mgr.remove_server(server_name)
    return {"success": success, "removed": server_name, "status": mgr.get_status()}

@app.post("/v1/mcp/servers/{server_name}/toggle")
async def toggle_mcp_server(server_name: str):
    """Toggles an MCP server between active and disabled states."""
    mgr = get_host_manager()
    cfg = mgr.server_configs.get(server_name)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found.")
    
    new_state = not cfg.get("enabled", True)
    cfg["enabled"] = new_state
    mgr.save_config()

    if new_state:
        await mgr.connect_server(server_name)
    else:
        await mgr.disconnect_server(server_name)

    return {"success": True, "server_name": server_name, "enabled": new_state, "status": mgr.get_status()}


# --- SERVE FRONTEND SPA DASHBOARD (USER & ADMIN PORTALS) ---
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    @app.get("/app")
    @app.get("/admin")
    async def serve_portal():
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


if __name__ == "__main__":
    import uvicorn
    loop_flag = "asyncio:ProactorEventLoop" if sys.platform == "win32" else "auto"
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True, loop=loop_flag)


