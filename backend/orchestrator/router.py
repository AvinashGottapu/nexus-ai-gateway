import os
import re
from enum import Enum
from typing import Dict, Any, Optional, List
from fastapi import HTTPException
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage

# Sibling modules inside the unified orchestrator folder:
from orchestrator.hitl import create_human_review_ticket
from orchestrator.rag import search_temporary_knowledge
from orchestrator.model_gateway import (
    execute_model_gateway,
    execute_model_gateway_stream,
    is_actual_code,
    is_complex_reasoning,
    get_routing_sla
)


# --- 1. PRODUCTION-GRADE INTENT & SUB-INTENT CLASSIFICATION ---

class IntentCategory(str, Enum):
    HIGH_RISK = "high_risk"
    RAG = "rag"
    GENERAL = "general"


class SubIntentCategory(str, Enum):
    CODING = "coding"
    REASONING = "reasoning"
    NORMAL = "normal"


class IntentClassification(BaseModel):
    category: IntentCategory = Field(
        description="The primary routing bucket for the query: 'high_risk', 'rag', or 'general'."
    )
    sub_intent: Optional[SubIntentCategory] = Field(
        default=None,
        description="If category is 'general', specify: 'coding' (code/sql/syntax/debugging), 'reasoning' (multi-step logic/math/system design), or 'normal' (chit-chat/greetings/summaries). For high_risk or rag, set to null."
    )
    confidence: float = Field(
        description="Confidence score between 0.0 and 1.0"
    )
    reasoning: str = Field(
        description="Brief 1-sentence justification for the chosen category and sub_intent."
    )


CLASSIFIER_PROMPT = """
You are the central Intent Routing Classifier for an enterprise AI system.
Classify the user prompt into exactly ONE primary category, and if 'general', choose its sub_intent:

1. 'high_risk': The user is requesting an IRREVERSIBLE, FINANCIAL, or DESTRUCTIVE ACTION:
   - Initiating an actual refund, money transfer, card charge, or payout.
   - Requesting account deletion, database wiping, or canceling an active subscription.
   - NOTE: Merely asking ABOUT policy (e.g., 'What is your refund policy on sale items?') is NOT high_risk; it is 'rag'.
   - NOTE: Standard developer tasks, Git/GitHub MCP operations (such as creating a repo, creating an issue, searching repositories, writing code) are 'general' with sub_intent 'coding', NOT high_risk!

2. 'rag': The user is inquiring about company policies, product manuals, specs, pricing, shipping, or catalog facts AND THAT CONTEXT IS MISSING:
   - Questions about returns, warranties, terms of service, shipping times where no reference context is given.
   - Questions about product specs, documentation, or FAQs requiring external knowledge lookup.
   - CRITICAL RULE: If the user ALREADY provided the reference context or passage directly inside the prompt, do NOT classify as 'rag'; classify as 'general' because the context is already present!

3. 'general': General discussion, coding help, technical debugging, math/reasoning, greetings, creative tasks:
   If category is 'general', you MUST select one sub_intent:
   - 'coding': Programming code snippets, functions, SQL queries, REST API code, syntax debugging, tracebacks, regex, algorithms, terminal scripts.
   - 'reasoning': Multi-step mathematical calculations/proofs, formal logic deductions, architectural system design tradeoffs, complex algorithmic analysis.
   - 'normal': Conversational chit-chat, greetings, summaries, explanations, general knowledge facts, standard Q&A.
"""


def classify_sub_intent_keywords(prompt: str) -> SubIntentCategory:
    """
    Deterministic regex and keyword heuristics with word-boundary awareness
    to classify general queries into 'coding', 'reasoning', or 'normal'.
    """
    p_lower = prompt.lower()

    # 1. Coding check (syntax patterns, tracebacks, programming keywords with word boundaries)
    code_pattern = (
        r"\b(python|javascript|typescript|golang|rust|java|c\+\+|sql|select|from|where|join|table|schema|query|"
        r"api|fastapi|express|django|flask|endpoint|crud|docker|dockerfile|redis|postgres|mongodb|sqlite|"
        r"bug|traceback|syntaxerror|typeerror|nullpointer|regex|algorithm|refactor|git|github|npm|pip|"
        r"async|await|lambda|def|class|function|const|let|var|import)\b"
    )
    if is_actual_code(prompt) or re.search(code_pattern, p_lower):
        return SubIntentCategory.CODING

    # 2. Reasoning check (logic proofs, math, step-by-step deduction, architecture tradeoffs)
    reasoning_pattern = (
        r"(\bstep[\s-]by[\s-]step\b|\bprove\s+that\b|\bderivation\b|\bderive\b|\bproof\b|"
        r"\bcalculate\b|\bsolve\s+for\b|\bmath\s+problem\b|\blogic\s+puzzle\b|"
        r"\barchitecture\s+design\b|\bsystem\s+design\b|\btradeoff\b|\btrade-off\b|"
        r"\bpros\s+and\s+cons\b|\bbig[\s-]o\b|\btime\s+complexity\b|\bspace\s+complexity\b|\bdeduce\b)"
    )
    if is_complex_reasoning(prompt) or re.search(reasoning_pattern, p_lower):
        return SubIntentCategory.REASONING

    return SubIntentCategory.NORMAL


async def classify_intent(prompt: str) -> IntentClassification:
    """
    Production-grade Intent Classifier using Groq's fast Llama 3.1 8B Instant.
    Executes in ~50ms and guarantees a type-safe Pydantic output.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        sub_fallback = classify_sub_intent_keywords(prompt)
        return IntentClassification(
            category=IntentCategory.GENERAL,
            sub_intent=sub_fallback,
            confidence=1.0,
            reasoning=f"Default fallback: Groq API key not set (routed to {sub_fallback.value})"
        )

    classifier_llm = ChatGroq(
        model="openai/gpt-oss-120b",
        api_key=api_key,
        temperature=0.0
    ).with_structured_output(IntentClassification)

    try:
        result = await classifier_llm.ainvoke([
            {"role": "system", "content": CLASSIFIER_PROMPT},
            {"role": "user", "content": prompt}
        ])
        if result.category == IntentCategory.GENERAL and not result.sub_intent:
            result.sub_intent = classify_sub_intent_keywords(prompt)
        return result
    except Exception as e:
        print(f"⚠️ Intent classification warning ({e}), checking deterministic fallback.")
        p_lower = prompt.lower()
        if any(w in p_lower for w in ["transfer", "wire money", "escrow", "delete account", "drop table", "truncate", "payout"]):
            return IntentClassification(
                category=IntentCategory.HIGH_RISK,
                sub_intent=None,
                confidence=0.95,
                reasoning="Deterministic rule flagged high-risk financial or destructive mutation."
            )
        if any(w in p_lower for w in ["policy", "warranty", "manual", "return policy", "documentation"]):
            return IntentClassification(
                category=IntentCategory.RAG,
                sub_intent=None,
                confidence=0.85,
                reasoning="Deterministic rule flagged knowledge retrieval intent."
            )

        sub_fallback = classify_sub_intent_keywords(prompt)
        return IntentClassification(
            category=IntentCategory.GENERAL,
            sub_intent=sub_fallback,
            confidence=0.75,
            reasoning=f"Deterministic rule classified as general ({sub_fallback.value}) due to classifier fallback."
        )


# --- 2. MASTER ROUTER & ORCHESTRATOR (04 Router) ---

async def orchestrate_request(
    prompt: str,
    requested_model: Optional[str] = "auto",
    inline_context: Optional[str] = None,
    max_tokens: int = 2048,
    chat_history: Optional[List[BaseMessage]] = None,
    intent_data: Optional[IntentClassification] = None,
    enable_mcp: bool = True
) -> Dict[str, Any]:
    """
    04 Router + Orchestrator:
    Dispatches execution paths based on classified intent:
    - Branch 1: 'high_risk' -> 08 Human in the Loop (Halt LLM, create approval ticket)
    - Branch 2: 'rag'       -> 05 Retrieval / RAG (Augment prompt with inline or 2-hour knowledge context)
    - Branch 3: 'general'   -> 07 Model Gateway (Token budgets, retries, and fallback cascade)
    """
    # 1. Classify intent via fast structured output (or reuse pre-timed classification)
    if intent_data is None:
        intent_data = await classify_intent(prompt)
    category = intent_data.category

    # If the user explicitly provided inline context in the request, prioritize RAG intent
    if inline_context and inline_context.strip():
        category = IntentCategory.RAG

    # ==========================================================
    # BRANCH 1: HIGH RISK (08 Human in the Loop)
    # ==========================================================
    if category == IntentCategory.HIGH_RISK:
        # HALT EXECUTION: Never allow an LLM to execute destructive/financial actions!
        ticket_id = create_human_review_ticket(
            prompt=prompt,
            reason=intent_data.reasoning
        )
        return {
            "status": "pending_human_approval",
            "intent": category.value,
            "intent_confidence": intent_data.confidence,
            "intent_reasoning": intent_data.reasoning,
            "ticket_id": ticket_id,
            "action_taken": "escalated_to_human_supervisor",
            "provider_used": "none",
            "failover_triggered": False,
            "sources_used": [],
            "response": (
                "Your request involves a sensitive operation (financial, security, or data modification). "
                f"Review Ticket #{ticket_id} has been created and submitted to a human supervisor for authorization."
            ),
            "response_metadata": {}
        }

    # ==========================================================
    # BRANCH 2: 05 RETRIEVAL / RAG (Grounding Context)
    # ==========================================================
    execution_prompt = prompt
    sources_used = []

    # Priority A: If user passed inline context directly in request (Zero vector search latency!)
    if inline_context and inline_context.strip():
        sources_used = ["inline_request_context"]
        execution_prompt = (
            f"You are a helpful assistant. Use ONLY the following provided context to answer the user's question:\n"
            f"<context>\n{inline_context.strip()}\n</context>\n\n"
            f"User Question: {prompt}\n\n"
            f"Please cite your sources based on the context above."
        )

    # Priority B: Query the 2-Hour Redis Knowledge Store if intent is RAG
    elif category == IntentCategory.RAG:
        retrieved_chunks = await search_temporary_knowledge(prompt, top_k=2)
        if retrieved_chunks:
            sources_used = list(set([c["source"] for c in retrieved_chunks]))
            context_block = "\n\n".join([f"[{c['source']}]: {c['chunk_text']}" for c in retrieved_chunks])
            execution_prompt = (
                f"You are a helpful assistant. Use ONLY the following verified context (stored temporarily for 2 hours) to answer the user's question:\n"
                f"<context>\n{context_block}\n</context>\n\n"
                f"User Question: {prompt}\n\n"
                f"Please cite your sources based on the context above."
            )

    # ==========================================================
    # BRANCH 3: 07 MODEL GATEWAY (Token Budgets, Retries & Dynamic Sub-Intent)
    # ==========================================================
    sub_intent_val = intent_data.sub_intent.value if intent_data.sub_intent else None

    gateway_result = await execute_model_gateway(
        prompt=execution_prompt,
        requested_model=requested_model,
        max_tokens=max_tokens,
        retry_attempts=1,
        chat_history=chat_history,
        sub_intent=sub_intent_val,
        enable_mcp=enable_mcp
    )

    routing_sla = get_routing_sla(gateway_result["provider_used"], sub_intent_val)

    return {
        "status": gateway_result["status"],
        "intent": category.value,
        "sub_intent": sub_intent_val,
        "intent_confidence": intent_data.confidence,
        "intent_reasoning": intent_data.reasoning,
        "ticket_id": None,
        "sources_used": sources_used,
        "provider_used": gateway_result["provider_used"],
        "failover_triggered": gateway_result["failover_triggered"],
        "routing_decision": routing_sla,
        "savings_badge": routing_sla["savings_badge"],
        "response": gateway_result["response"],
        "mcp_tools_executed": gateway_result.get("mcp_tools_executed", []),
        "response_metadata": gateway_result["response_metadata"]
    }


# --- 3. STREAMING ORCHESTRATION WITH REAL-TIME CONTEXT INGESTION ---

async def orchestrate_request_stream(
    prompt: str,
    requested_model: Optional[str] = "auto",
    inline_context: Optional[str] = None,
    max_tokens: int = 2048,
    chat_history: Optional[List[BaseMessage]] = None,
    intent_data: Optional[IntentClassification] = None
):
    """
    Asynchronous streaming router yielding token-by-token events with sub-100ms TTFT.
    """
    if intent_data is None:
        intent_data = await classify_intent(prompt)
    category = intent_data.category

    if inline_context and inline_context.strip():
        category = IntentCategory.RAG

    # Branch 1: High-Risk Intent (Halt streaming, issue human review ticket immediately)
    if category == IntentCategory.HIGH_RISK:
        ticket_id = create_human_review_ticket(
            prompt=prompt,
            reason=f"High-Risk Intent Detected: {intent_data.reasoning}"
        )
        yield {
            "token": (
                "⚠️ Sensitive Operation Intercepted: Your request involves a high-risk financial, "
                f"security, or database mutation. Review Ticket #{ticket_id} has been dispatched "
                "to a human supervisor for authorization."
            ),
            "status": "pending_human_approval",
            "ticket_id": ticket_id,
            "provider": "hitl_supervisor",
            "done": True
        }
        return

    # Branch 2: Context Augmentation
    execution_prompt = prompt
    if inline_context and inline_context.strip():
        execution_prompt = (
            f"You are a helpful assistant. Use ONLY the following provided context to answer the user's question:\n"
            f"<context>\n{inline_context.strip()}\n</context>\n\n"
            f"User Question: {prompt}\n\n"
            f"Please cite your sources based on the context above."
        )
    elif category == IntentCategory.RAG:
        retrieved_chunks = await search_temporary_knowledge(prompt, top_k=2)
        if retrieved_chunks:
            context_block = "\n\n".join([f"[{c['source']}]: {c['chunk_text']}" for c in retrieved_chunks])
            execution_prompt = (
                f"You are a helpful assistant. Use ONLY the following verified context (stored temporarily for 2 hours) to answer the user's question:\n"
                f"<context>\n{context_block}\n</context>\n\n"
                f"User Question: {prompt}\n\n"
                f"Please cite your sources based on the context above."
            )

    # Branch 3: Yield streamed tokens from Model Gateway
    sub_intent_val = intent_data.sub_intent.value if intent_data.sub_intent else None

    async for chunk in execute_model_gateway_stream(
        prompt=execution_prompt,
        requested_model=requested_model,
        max_tokens=max_tokens,
        chat_history=chat_history,
        sub_intent=sub_intent_val
    ):
        routing_sla = get_routing_sla(chunk["provider"], sub_intent_val)
        yield {
            "token": chunk["token"],
            "provider": chunk["provider"],
            "failover_triggered": chunk.get("failover_triggered", False),
            "intent": category.value,
            "sub_intent": sub_intent_val,
            "routing_decision": routing_sla,
            "savings_badge": routing_sla["savings_badge"],
            "done": False
        }

