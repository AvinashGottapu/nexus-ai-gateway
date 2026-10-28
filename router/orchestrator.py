import os
import asyncio
from enum import Enum
from typing import Dict, Any, Optional, Tuple, List
from fastapi import HTTPException
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

# 08 Human in the Loop ticket manager
from hitl.tickets import create_human_review_ticket

# 05 Temporary RAG store (2-hour auto-wiping cache)
from rag.temporary_store import search_temporary_knowledge


# --- 1. PRODUCTION-GRADE INTENT CLASSIFICATION (The Dispatcher) ---

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

2. 'rag': The user is inquiring about company policies, product manuals, specs, pricing, shipping, or catalog facts:
   - Questions about returns, warranties, terms of service, shipping times.
   - Questions about product specs, documentation, or FAQs.

3. 'general': General discussion, coding help, technical debugging, greetings, or creative tasks:
   - Example: 'How do I avoid wiping database tables during migrations?' is 'general' technical help.
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
        model="llama-3.1-8b-instant",
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
        print(f"⚠️ Intent classification warning ({e}), falling back to general.")
        return IntentClassification(
            category=IntentCategory.GENERAL,
            confidence=0.5,
            reasoning="Fallback to general due to classifier error"
        )


# --- 2. MODEL POLICY SELECTOR ---

def resolve_model(requested_model: Optional[str], prompt: str) -> str:
    """
    Resolves model alias into a concrete provider:
    - 'fast'  -> Groq (LPU speed)
    - 'cheap' -> Gemini Flash (lowest cost)
    - 'auto'  -> Inspects prompt complexity (simple vs complex)
    """
    if not requested_model or requested_model == "auto":
        word_count = len(prompt.split())
        if word_count > 100 or "code" in prompt.lower() or "debug" in prompt.lower():
            return "openai"
        return "groq"

    req = requested_model.lower()
    if req in ["fast", "groq"]:
        return "groq"
    elif req in ["cheap", "gemini"]:
        return "gemini"
    elif req in ["smart", "openai"]:
        return "openai"

    return req


# --- 3. MODEL INSTANTIATOR ---

def create_model_instance(provider: str):
    """Initializes the LangChain chat model for a given provider."""
    if provider == "groq":
        return ChatGroq(
            model="llama-3.3-70b-versatile",
            api_key=os.getenv("GROQ_API_KEY"),
            timeout=10.0
        )
    elif provider == "gemini":
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            timeout=10.0
        )
    elif provider == "openai":
        return ChatOpenAI(
            model="gpt-4o-mini",
            api_key=os.getenv("OPENAI_API_KEY"),
            timeout=10.0
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'")


# --- 4. ORCHESTRATOR WITH ACTIVE INTENT BRANCHING (Layer B) ---

async def orchestrate_request(
    prompt: str,
    requested_model: Optional[str] = "auto"
) -> Dict[str, Any]:
    """
    04 Router + Orchestrator:
    Dispatches execution paths based on classified intent:
    - Branch 1: 'high_risk' -> 08 Human in the Loop (Halt LLM, create approval ticket)
    - Branch 2: 'rag'       -> 05 Retrieval / RAG (Augment prompt with 2-hour knowledge store)
    - Branch 3: 'general'   -> 07 Model Gateway (Direct fast failover inference)
    """
    # 1. Classify intent via fast Llama 3.1 8B structured output
    intent_data = await classify_intent(prompt)
    category = intent_data.category

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
    # BRANCH 2: 05 RETRIEVAL / RAG (2-Hour Temporary Knowledge)
    # ==========================================================
    execution_prompt = prompt
    sources_used = []

    if category == IntentCategory.RAG:
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
    # BRANCH 3: 07 MODEL GATEWAY (Failover Circuit Breaker)
    # ==========================================================
    primary_provider = resolve_model(requested_model, execution_prompt)

    fallback_chain = ["groq", "gemini", "openai"]
    if primary_provider in fallback_chain:
        fallback_chain.remove(primary_provider)
    provider_order = [primary_provider] + fallback_chain

    last_error = None
    provider_used = primary_provider

    for provider in provider_order:
        try:
            model = create_model_instance(provider)
            # Execute LLM call asynchronously with grounded prompt
            response = await model.ainvoke(execution_prompt)
            provider_used = provider

            return {
                "status": "completed",
                "intent": category.value,
                "intent_confidence": intent_data.confidence,
                "intent_reasoning": intent_data.reasoning,
                "ticket_id": None,
                "sources_used": sources_used,
                "provider_used": provider_used,
                "failover_triggered": provider_used != primary_provider,
                "response": response.content,
                "response_metadata": getattr(response, "response_metadata", {})
            }
        except Exception as e:
            print(f"⚠️ Provider '{provider}' failed ({e}). Attempting automatic failover...")
            last_error = e
            continue

    # If all providers in the chain fail
    raise HTTPException(
        status_code=503,
        detail=f"All upstream LLM providers failed. Last error: {str(last_error)}"
    )
