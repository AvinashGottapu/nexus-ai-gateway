import os
import asyncio
from typing import Dict, Any, Optional, Tuple
from fastapi import HTTPException
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI


# --- 1. INTENT CLASSIFICATION (The Dispatcher) ---

def classify_intent(prompt: str) -> str:
    """
    Analyzes prompt intent to decide which branch of Layer B to trigger:
    - 'high_risk' -> Escalates to 08 Human in the Loop (e.g. money, delete, refunds)
    - 'rag'       -> Dispatches to 05 Retrieval / RAG (e.g. docs, policy, catalog)
    - 'general'   -> Dispatches to 07 Model Gateway (Standard LLM inference)
    """
    prompt_lower = prompt.lower()

    # High-risk trigger keywords (Prepares for 08 Human in the loop)
    high_risk_keywords = ["refund", "wire transfer", "delete account", "wipe database", "cancel subscription", "credit card charge"]
    if any(kw in prompt_lower for kw in high_risk_keywords):
        return "high_risk"

    # Knowledge retrieval trigger keywords (Prepares for 05 RAG)
    rag_keywords = ["according to the document", "company policy", "product catalog", "search knowledge", "in the pdf"]
    if any(kw in prompt_lower for kw in rag_keywords):
        return "rag"

    return "general"


# --- 2. MODEL POLICY SELECTOR ---

def resolve_model(requested_model: Optional[str], prompt: str) -> str:
    """
    Resolves model alias into a concrete provider:
    - 'fast'  -> Groq (LPU speed)
    - 'cheap' -> Gemini Flash (lowest cost)
    - 'auto'  -> Inspects prompt complexity (simple vs complex)
    """
    if not requested_model or requested_model == "auto":
        # Simple heuristic: short prompts go to fast/cheap, complex prompts go to flagship
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


# --- 4. ORCHESTRATOR WITH AUTOMATIC FAILOVER (Layer B - 07) ---

async def orchestrate_request(
    prompt: str,
    requested_model: Optional[str] = "auto"
) -> Dict[str, Any]:
    """
    04 Router + Orchestrator:
    1. Classifies user intent (general, rag, high_risk)
    2. Resolves primary model
    3. Executes with automatic failover (Circuit Breaker)
    """
    intent = classify_intent(prompt)
    primary_provider = resolve_model(requested_model, prompt)

    # Failover sequence: If primary fails -> try backup 1 -> try backup 2
    fallback_chain = ["groq", "gemini", "openai"]
    # Put primary provider at the front of the list
    if primary_provider in fallback_chain:
        fallback_chain.remove(primary_provider)
    provider_order = [primary_provider] + fallback_chain

    last_error = None
    provider_used = primary_provider

    for provider in provider_order:
        try:
            model = create_model_instance(provider)
            # Execute LLM call asynchronously
            response = await model.ainvoke(prompt)
            provider_used = provider

            return {
                "intent": intent,
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
