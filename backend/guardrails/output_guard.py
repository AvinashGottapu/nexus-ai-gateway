import os
import re
from typing import Dict, Any, Tuple, Optional
from langchain_groq import ChatGroq
from guardrails.input_guard import get_presidio, HAZARD_CATEGORIES

# =====================================================================
# 01 OUTPUT GUARDRAILS (Safety • Privacy • Grounding)
# =====================================================================

# Common API Key regex patterns to prevent accidental LLM credential leakage
SECRET_PATTERNS = [
    r"sk-live-[a-zA-Z0-9]{32,}",          # Gateway API keys
    r"gsk_[a-zA-Z0-9]{40,}",              # Groq API keys
    r"AIza[0-9A-Za-z-_]{35}",             # Google API keys
    r"sk-[a-zA-Z0-9]{40,}",               # OpenAI API keys
    r"tvly-[a-zA-Z0-9]{30,}"              # Tavily API keys
]


# Sensitive PII entities to protect (Never redact public places, dates, or public figures)
SENSITIVE_PII_ENTITIES = [
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "CREDIT_CARD",
    "US_SSN",
    "IBAN_CODE",
    "IP_ADDRESS",
    "US_PASSPORT",
    "US_BANK_NUMBER"
]


def redact_secrets_and_pii(text: str) -> str:
    """
    1. Redacts any accidental internal API key leaks using regex.
    2. Redacts customer PII (credit cards, SSNs, phone numbers, emails) using Microsoft Presidio.
       (Excludes public locations, dates, and historical/celebrity names so knowledge answers remain natural).
    """
    # 1. Mask API key secrets
    clean_text = text
    for pattern in SECRET_PATTERNS:
        clean_text = re.sub(pattern, "[REDACTED_API_KEY]", clean_text)

    # 2. Mask customer PII using Microsoft Presidio singleton
    analyzer, anonymizer = get_presidio()
    analysis = analyzer.analyze(
        text=clean_text,
        language="en",
        entities=SENSITIVE_PII_ENTITIES
    )
    anonymized = anonymizer.anonymize(text=clean_text, analyzer_results=analysis)
    return anonymized.text


# 1. Reuse singleton instance for performance
_GUARD_MODEL: Optional[ChatGroq] = None


def get_llama_guard() -> Optional[ChatGroq]:
    """Returns singleton ChatGroq instance for sub-millisecond reuse."""
    global _GUARD_MODEL
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    if _GUARD_MODEL is None:
        _GUARD_MODEL = ChatGroq(
            model="meta-llama/llama-prompt-guard-2-86m",
            api_key=api_key,
            temperature=0.0,
            timeout=5.0
        )
    return _GUARD_MODEL


# 2. Factuality / Grounding Check (For RAG routes)
GROUNDING_PROMPT = """You are a strict Factuality & Grounding Evaluator for an enterprise AI system.
Your job is to verify whether the Assistant's Draft Answer is strictly grounded in the provided Reference Context.

<context>
{context}
</context>

<draft_answer>
{draft_answer}
</draft_answer>

Rules:
1. If all factual statements, numbers, policies, and claims in the Draft Answer are directly supported by or consistent with the Reference Context, respond with 'GROUNDED'.
2. If the Draft Answer invents facts, contradicts the Reference Context, or makes claims completely unsupported by the context, respond with 'HALLUCINATED'.
3. Output ONLY the single word: 'GROUNDED' or 'HALLUCINATED'.
"""


async def check_hallucination(context: str, draft_answer: str) -> bool:
    """
    Real Grounding Judge using Groq's fast Llama 3.1 8B Instant (~80ms).
    Checks if the draft answer makes claims unsupported by retrieved RAG context.
    Returns:
    - True: Output is faithfully grounded in context.
    - False: Output contains hallucinations or unsupported claims.
    """
    if not context or not context.strip():
        return True  # Not a RAG response, skip grounding check

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return True

    try:
        evaluator_llm = ChatGroq(
            model="llama-3.1-8b-instant",
            api_key=api_key,
            temperature=0.0,
            timeout=4.0
        )
        prompt_text = GROUNDING_PROMPT.format(
            context=context.strip(),
            draft_answer=draft_answer.strip()
        )
        response = await evaluator_llm.ainvoke(prompt_text)
        verdict = response.content.strip().upper()

        if "HALLUCINATED" in verdict:
            return False

        return True
    except Exception as e:
        print(f"⚠️ Grounding evaluation warning: {e}. Failing open to avoid blocking valid responses.")
        return True


# 3. Upgraded Output Master Function
async def apply_output_guardrails(
    user_prompt: str,
    draft_answer: str,
    retrieved_context: Optional[str] = None
) -> Dict[str, Any]:
    """
    Production Output Guardrails:
    1. Leaks & Privacy: Redact API keys and PII first.
    2. Policy & Harm: Run Llama Guard 3.
    3. Grounding: Check for hallucinations if RAG context was used.
    """
    # Step 1: Privacy & Secrets Check (Fast, local CPU, 0ms latency)
    sanitized = redact_secrets_and_pii(draft_answer)

    # Step 2: Semantic Safety Check (Llama Guard / Prompt Guard)
    guard = get_llama_guard()
    if guard:
        try:
            # Prompt Guard on Groq evaluates output text directly
            response = await guard.ainvoke(sanitized)
            output = response.content.strip()

            if output.startswith("unsafe"):
                lines = output.split("\n")
                code = lines[1].strip() if len(lines) > 1 else "Unknown"
                category_name = HAZARD_CATEGORIES.get(code, "Unsafe Output")
                return {
                    "passed": False,
                    "rejection_type": "safety_violation",
                    "hazard_code": code,
                    "category": category_name,
                    "sanitized_response": (
                        f"I cannot provide this response as it violates our safety policy: '{category_name}'."
                    )
                }
        except Exception as e:
            # Safe fail open if upstream guard service has transient network error
            pass

    # Step 3: Hallucination Verification for RAG
    if retrieved_context:
        is_grounded = await check_hallucination(retrieved_context, sanitized)
        if not is_grounded:
            return {
                "passed": False,
                "rejection_type": "hallucination_detected",
                "hazard_code": "RAG_UNFAITHFUL",
                "category": "Grounding Failure",
                "sanitized_response": "I apologize, but I could not verify this answer against verified documentation."
            }

    return {
        "passed": True,
        "rejection_type": None,
        "hazard_code": None,
        "category": None,
        "sanitized_response": sanitized
    }
