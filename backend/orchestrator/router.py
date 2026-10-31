import os
from enum import Enum
from typing import Dict, Any, Optional, List
from fastapi import HTTPException
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.messages import BaseMessage

# Sibling modules inside the unified orchestrator folder:
from orchestrator.hitl import create_human_review_ticket
from orchestrator.rag import search_temporary_knowledge
from orchestrator.model_gateway import execute_model_gateway


# --- 1. PRODUCTION-GRADE INTENT CLASSIFICATION ---

class IntentCategory(str, Enum):
    HIGH_RISK = "high_risk"
    RAG = "rag"
    GENERAL = "general"


class IntentClassification(BaseModel):
    category: IntentCategory = Field(
        description="The primary routing bucket for the query: 'high_risk', 'rag', or 'general'."
    )
    confidence: float = Field(
        description="Confidence score between 0.0 and 1.0"
    )
    reasoning: str = Field(
        description="Brief 1-sentence justification for the chosen category."
    )


CLASSIFIER_PROMPT = """
You are the central Intent Routing Classifier for an enterprise AI system.
Classify the user prompt into exactly ONE category:

1. 'high_risk': The user is requesting an IRREVERSIBLE, FINANCIAL, or DESTRUCTIVE ACTION:
   - Initiating an actual refund, money transfer, card charge, or payout.
   - Requesting account deletion, database wiping, or canceling an active subscription.
   - NOTE: Merely asking ABOUT policy (e.g., 'What is your refund policy on sale items?') is NOT high_risk; it is 'rag'.

2. 'rag': The user is inquiring about company policies, product manuals, specs, pricing, shipping, or catalog facts AND THAT CONTEXT IS MISSING:
   - Questions about returns, warranties, terms of service, shipping times where no reference context is given.
   - Questions about product specs, documentation, or FAQs requiring external knowledge lookup.
   - CRITICAL RULE: If the user ALREADY provided the reference context or passage directly inside the prompt (e.g. 'Based on this text: ...', 'Here is our policy: [...] Question: ...'), do NOT classify as 'rag'; classify as 'general' because the context is already present!

3. 'general': General discussion, coding help, technical debugging, greetings, creative tasks, OR any question where the reference context is ALREADY provided inside the prompt:
   - Example: 'Based on this paragraph [Returns within 30 days], can I return my laptop?' is 'general' because the context is already right in the prompt!
"""


async def classify_intent(prompt: str) -> IntentClassification:
    """
    Production-grade Intent Classifier using Groq's fast Llama 3.1 8B Instant.
    Executes in ~50ms and guarantees a type-safe Pydantic output.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return IntentClassification(
            category=IntentCategory.GENERAL,
            confidence=1.0,
            reasoning="Default fallback: Groq API key not set"
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
        return result
    except Exception as e:
        print(f"⚠️ Intent classification warning ({e}), checking deterministic fallback.")
        p_lower = prompt.lower()
        if any(w in p_lower for w in ["transfer", "wire money", "escrow", "delete account", "drop table", "truncate", "payout"]):
            return IntentClassification(
                category=IntentCategory.HIGH_RISK,
                confidence=0.95,
                reasoning="Deterministic rule flagged high-risk financial or destructive mutation."
            )
        if any(w in p_lower for w in ["policy", "warranty", "manual", "return policy", "documentation"]):
            return IntentClassification(
                category=IntentCategory.RAG,
                confidence=0.85,
                reasoning="Deterministic rule flagged knowledge retrieval intent."
            )
        return IntentClassification(
            category=IntentCategory.GENERAL,
            confidence=0.5,
            reasoning="Fallback to general due to classifier error"
        )


# --- 2. MASTER ROUTER & ORCHESTRATOR (04 Router) ---

async def orchestrate_request(
    prompt: str,
    requested_model: Optional[str] = "auto",
    inline_context: Optional[str] = None,
    max_tokens: int = 1024,
    chat_history: Optional[List[BaseMessage]] = None
) -> Dict[str, Any]:
    """
    04 Router + Orchestrator:
    Dispatches execution paths based on classified intent:
    - Branch 1: 'high_risk' -> 08 Human in the Loop (Halt LLM, create approval ticket)
    - Branch 2: 'rag'       -> 05 Retrieval / RAG (Augment prompt with inline or 2-hour knowledge context)
    - Branch 3: 'general'   -> 07 Model Gateway (Token budgets, retries, and fallback cascade)
    """
    # 1. Classify intent via fast Llama 3.1 8B structured output
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
    # BRANCH 3: 07 MODEL GATEWAY (Token Budgets, Retries & Failover)
    # ==========================================================
    gateway_result = await execute_model_gateway(
        prompt=execution_prompt,
        requested_model=requested_model,
        max_tokens=max_tokens,
        retry_attempts=1,
        chat_history=chat_history
    )

    return {
        "status": gateway_result["status"],
        "intent": category.value,
        "intent_confidence": intent_data.confidence,
        "intent_reasoning": intent_data.reasoning,
        "ticket_id": None,
        "sources_used": sources_used,
        "provider_used": gateway_result["provider_used"],
        "failover_triggered": gateway_result["failover_triggered"],
        "response": gateway_result["response"],
        "response_metadata": gateway_result["response_metadata"]
    }
