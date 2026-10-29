import os
import re
import asyncio
from typing import Dict, Any, Optional, List
from fastapi import HTTPException
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

# Layer D: Reliability & Scale (Stateful Circuit Breaker)
from orchestrator.circuit_breaker import circuit_breaker


# --- 1. MODEL PRICING CATALOG (USD per single token) ---

MODEL_PRICING = {
    # Gemini 1.5 Flash: $0.075 / 1M prompt, $0.30 / 1M completion
    "gemini": {
        "prompt_cost_per_token": 0.000000075,
        "completion_cost_per_token": 0.00000030,
        "model_name": "gemini-1.5-flash"
    },
    # OpenAI GPT-4o-mini: $0.15 / 1M prompt, $0.60 / 1M completion
    "openai": {
        "prompt_cost_per_token": 0.00000015,
        "completion_cost_per_token": 0.00000060,
        "model_name": "gpt-4o-mini"
    },
    # Groq Llama 3.3 70B: $0.59 / 1M prompt, $0.79 / 1M completion
    "groq": {
        "prompt_cost_per_token": 0.00000059,
        "completion_cost_per_token": 0.00000079,
        "model_name": "llama-3.3-70b-versatile"
    }
}

# Provider alias and model ID catalog mapping
MODEL_CATALOG = {
    # Groq aliases & models
    "fast": "groq",
    "speed": "groq",
    "groq": "groq",
    "llama": "groq",
    "llama-3.3-70b-versatile": "groq",
    "llama-3.1-8b-instant": "groq",

    # Gemini aliases & models
    "cheap": "gemini",
    "cost": "gemini",
    "gemini": "gemini",
    "gemini-1.5-flash": "gemini",
    "gemini-1.5-pro": "gemini",

    # OpenAI aliases & models
    "smart": "openai",
    "reasoning": "openai",
    "openai": "openai",
    "gpt": "openai",
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai"
}


def calculate_token_cost(provider: str, prompt_tokens: int, completion_tokens: int) -> float:
    """
    Calculates exact USD cost down to 6 decimal places based on the specific provider.
    """
    provider_key = provider.lower()
    rates = MODEL_PRICING.get(provider_key, MODEL_PRICING["groq"])

    cost = (prompt_tokens * rates["prompt_cost_per_token"]) + (completion_tokens * rates["completion_cost_per_token"])
    return round(max(0.00001, cost), 6)


# --- 2. CODE & COMPLEXITY DETECTION HEURISTICS ---

def is_actual_code(text: str) -> bool:
    """
    Detects genuine programming syntax, code snippets, or error tracebacks,
    distinguishing real code from conversational mentions of the word 'code'.
    """
    code_patterns = [
        r"```[\w]*\n",                       # Markdown code blocks
        r"\bdef\s+\w+\s*\(",                  # Python def foo()
        r"\bclass\s+\w+[\s\(:]",              # Class definition
        r"\bimport\s+[\w\.]+",                # Python import foo
        r"\bfrom\s+[\w\.]+\s+import",         # Python from foo import bar
        r"\bfunction\s*\w*\s*\(",             # JS/TS function foo()
        r"\bconst\s+\w+\s*=",                 # JS const x =
        r"\blet\s+\w+\s*=",                   # JS let x =
        r"\bvar\s+\w+\s*=",                   # JS var x =
        r"\{[\s\S]*\}",                       # C-style braces / JSON
        r"console\.log\(",                    # console.log
        r"print\s*\(",                        # print()
        r"\bSELECT\s+[\s\S]+\s+FROM\b",       # SQL queries
        r"traceback\s+\(most recent call last\):", # Stack traces / error logs
        r"NullPointerException|SyntaxError|TypeError|IndexError" # Common exceptions
    ]
    return any(re.search(pat, text, re.IGNORECASE) for pat in code_patterns)


def is_complex_reasoning(text: str) -> bool:
    """
    Detects multi-step mathematical, architectural, or analytical reasoning requests.
    """
    reasoning_patterns = [
        r"\bstep[\s-]by[\s-]step\b",
        r"\bprove\s+that\b",
        r"\bderive\s+the\b",
        r"\barchitecture\s+design\b",
        r"\bcalculate\s+the\s+complexity\b",
        r"\bbig[\s-]o\b"
    ]
    return any(re.search(pat, text, re.IGNORECASE) for pat in reasoning_patterns)


# --- 3. MODEL POLICY SELECTOR ---

def resolve_model(requested_model: Optional[str], prompt: str) -> str:
    """
    Resolves model alias into a concrete provider:
    - User requested specific model / alias -> mapped via MODEL_CATALOG
    - User requested 'auto' (or omitted):
        * Genuine code or complex reasoning -> 'openai' (GPT-4o-mini)
        * Large text / documents (>300 words) -> 'gemini' (Flash large context & ultra cheap)
        * Standard query -> 'groq' (Sub-200ms LPU speed)
    """
    if requested_model:
        req = requested_model.strip().lower()
        if req in MODEL_CATALOG:
            return MODEL_CATALOG[req]

    # Dynamic intelligent routing for "auto" or unspecified requests
    if is_actual_code(prompt) or is_complex_reasoning(prompt):
        return "openai"

    word_count = len(prompt.split())
    if word_count > 300:
        return "gemini"

    return "groq"


# --- 3. MODEL INSTANTIATOR WITH TOKEN BUDGETS & TIMEOUTS ---

def create_model_instance(provider: str, max_tokens: int = 1024, timeout: float = 10.0):
    """
    07 Model Gateway:
    Instantiates provider model with strict token budgets & timeout caps.
    """
    if provider == "groq":
        return ChatGroq(
            model="llama-3.3-70b-versatile",
            api_key=os.getenv("GROQ_API_KEY"),
            max_tokens=max_tokens,
            timeout=timeout
        )
    elif provider == "gemini":
        return ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            max_output_tokens=max_tokens,
            timeout=timeout
        )
    elif provider == "openai":
        return ChatOpenAI(
            model="gpt-4o-mini",
            api_key=os.getenv("OPENAI_API_KEY"),
            max_tokens=max_tokens,
            timeout=timeout
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'")


# --- 4. CONCURRENCY CAPS (asyncio.Semaphore) ---

# Master fallback semaphore singleton (Ensures unknown/default providers never create unlimited semaphores)
GLOBAL_FALLBACK_SEMAPHORE = asyncio.Semaphore(15)

# Per-provider concurrency caps (Protects upstream models from 429 Rate Limit Exceeded)
PROVIDER_SEMAPHORES: Dict[str, asyncio.Semaphore] = {
    "groq": asyncio.Semaphore(15),      # Groq fast LPUs: max 15 active calls
    "openai": asyncio.Semaphore(20),    # OpenAI GPT-4o-mini: max 20 active calls
    "gemini": asyncio.Semaphore(15)     # Gemini 1.5 Flash: max 15 active calls
}

# Maximum time (in seconds) a request will wait in a provider's queue before auto-failing over
SEMAPHORE_QUEUE_TIMEOUT = 2.0


# --- 5. EXECUTE WITH AUTOMATIC RETRIES, CONCURRENCY CAPS & FALLBACK CASCADE ---

async def execute_model_gateway(
    prompt: str,
    requested_model: Optional[str] = "auto",
    max_tokens: int = 1024,
    retry_attempts: int = 1,
    chat_history: Optional[List[BaseMessage]] = None
) -> Dict[str, Any]:
    """
    07 Model Gateway:
    - Enforces token budgets (max_tokens)
    - Enforces timeouts (10s)
    - Concurrency caps per provider (asyncio.Semaphore) to prevent 429 rate limits
    - Smart queue timeout (2s): auto-fails over if a provider queue is congested
    - Automatic retries with backoff
    - Seamless fallback cascade: Primary -> Fallback 1 -> Fallback 2
    - Context-aware multi-turn conversations (supports chat_history from Session Store)
    """
    primary_provider = resolve_model(requested_model, prompt)

    fallback_chain = ["groq", "gemini", "openai"]
    if primary_provider in fallback_chain:
        fallback_chain.remove(primary_provider)
    provider_order = [primary_provider] + fallback_chain

    last_error = None
    provider_used = primary_provider

    # Prepare input: Prepend past turns if conversation history exists
    invocation_input = list(chat_history) + [HumanMessage(content=prompt)] if chat_history else prompt

    for provider in provider_order:
        # ⚡ 1. CIRCUIT BREAKER CHECK (Instantly skips dead providers in 0.0ms!)
        if not circuit_breaker.can_execute(provider):
            print(f"⚡ Circuit OPEN for '{provider}' (outage cooldown active). Bypassing in 0.0ms...")
            continue

        # Fetch the shared singleton semaphore for this provider
        sem = PROVIDER_SEMAPHORES.get(provider, GLOBAL_FALLBACK_SEMAPHORE)

        # Try primary/fallback with retry loop
        for attempt in range(retry_attempts + 1):
            try:
                model = create_model_instance(provider, max_tokens=max_tokens, timeout=10.0)

                # Step 1: Wait max 2.0s ONLY to get an open slot in the concurrency queue
                async with asyncio.timeout(SEMAPHORE_QUEUE_TIMEOUT):
                    await sem.acquire()  # Countdown applies strictly to queue waiting!

                try:
                    # Step 2: Once inside the slot, the model gets its full 10.0s thinking budget!
                    response = await model.ainvoke(invocation_input)
                finally:
                    # Always release the concurrency slot so the next queued request can enter immediately
                    sem.release()

                provider_used = provider

                # ✅ 2. RECORD SUCCESS (Keeps circuit healthy and resets failure counters)
                circuit_breaker.record_success(provider)

                return {
                    "status": "completed",
                    "provider_used": provider_used,
                    "failover_triggered": provider_used != primary_provider,
                    "response": response.content,
                    "response_metadata": getattr(response, "response_metadata", {})
                }
            except TimeoutError:
                # Queue congestion: Provider queue didn't open a slot in 2s
                last_error = f"Concurrency queue timeout (> {SEMAPHORE_QUEUE_TIMEOUT}s wait) for '{provider}'"
                print(f"⚠️ Provider '{provider}' queue congested. Tripping failover to next provider...")
                circuit_breaker.record_failure(provider)
                break  # Skip remaining retries on this provider, immediately try next fallback!
            except Exception as e:
                last_error = e
                circuit_breaker.record_failure(provider)
                if attempt < retry_attempts:
                    await asyncio.sleep(0.3)  # Brief backoff before retry
                    continue
                else:
                    print(f"⚠️ Provider '{provider}' failed ({e}). Tripping to next fallback...")
                    break

    # If all providers in the fallback cascade fail
    raise HTTPException(
        status_code=503,
        detail=f"All upstream LLM providers failed in Model Gateway. Last error: {str(last_error)}"
    )
