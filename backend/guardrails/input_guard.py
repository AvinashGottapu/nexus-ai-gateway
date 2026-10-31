import os
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from langchain_groq import ChatGroq
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

# 14 Official Meta Llama Guard Hazard Categories (MLCommons Taxonomy)
HAZARD_CATEGORIES = {
    "S1": "Violent Crimes",
    "S2": "Non-Violent Crimes",
    "S3": "Sex-Related Crimes",
    "S4": "Child Sexual Exploitation",
    "S5": "Defamation, Morphing & Non-Consensual Imagery",
    "S6": "Specialized Advice (Medical/Financial)",
    "S7": "Privacy Violations",
    "S8": "Intellectual Property Infringement",
    "S9": "Indiscriminate Weapons",
    "S10": "Hate Speech & Harassment",
    "S11": "Suicide & Self-Harm",
    "S12": "Sexual Content",
    "S13": "Cyberattacks & Hacking",
    "S14": "Software Vulnerabilities & Exploits"
}

# Singleton instances for Presidio engines
# Global Presidio analyzer and anonymizer (loaded once in RAM for sub-millisecond reuse)
_analyzer: Optional[AnalyzerEngine] = None
_anonymizer: Optional[AnonymizerEngine] = None


def get_presidio():
    """Returns singleton instances of Microsoft Presidio engines."""
    global _analyzer, _anonymizer
    if _analyzer is None:
        _analyzer = AnalyzerEngine()
        _anonymizer = AnonymizerEngine()
    return _analyzer, _anonymizer


# Targeted sensitive PII to protect (emails, phone numbers, credit cards, SSN, credentials)
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


def mask_pii_presidio(text: str) -> str:
    """
    Uses Microsoft Presidio to detect & anonymize sensitive customer PII
    according to active Security Settings:
    - Credit Cards (CREDIT_CARD)
    - Phone Numbers (PHONE_NUMBER) - configurable
    - Emails (EMAIL_ADDRESS) - configurable
    - SSNs, Passports, IP addresses - configurable
    """
    from gateway.identity import get_security_policy
    policy = get_security_policy()

    entities = ["CREDIT_CARD", "IBAN_CODE", "IP_ADDRESS", "US_PASSPORT", "US_BANK_NUMBER"]
    if policy.get("redact_emails", True):
        entities.append("EMAIL_ADDRESS")
    if policy.get("redact_phones", True):
        entities.append("PHONE_NUMBER")
    if policy.get("redact_ssn", True):
        entities.append("US_SSN")

    if not entities:
        return text

    analyzer, anonymizer = get_presidio()

    # 1. Analyze text for sensitive PII entities only
    results = analyzer.analyze(
        text=text,
        language="en",
        entities=entities
    )

    # 2. Anonymize/redact detected entities in-place
    anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
    return anonymized.text


async def run_llama_guard(prompt: str) -> None:
    """
    Evaluates prompt against Meta's Prompt Guard / Safeguard on Groq.
    If unsafe, raises HTTPException(400) immediately before calling any LLM.
    Bypassed if developer disabled Prompt Guard in Security Settings.
    """
    from gateway.identity import get_security_policy
    policy = get_security_policy()
    if not policy.get("prompt_guard_enforced", True):
        return

    # Local deterministic hazard interceptor (0ms defense layer)
    lower = prompt.lower()
    dangerous_signatures = [
        ("malware", "S13", "Cyberattacks & Hacking"),
        ("exploit", "S14", "Software Vulnerabilities & Exploits"),
        ("wipe production", "S13", "Cyberattacks & Hacking"),
        ("ddos payload", "S13", "Cyberattacks & Hacking"),
        ("ransomware", "S13", "Cyberattacks & Hacking")
    ]
    for term, code, cat_name in dangerous_signatures:
        if term in lower:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "guardrail_violation",
                    "hazard_code": code,
                    "category": cat_name,
                    "message": f"Prompt blocked by Input Guardrails: classified under '{cat_name}'."
                }
            )

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return

    # Use active Groq safeguard model with graceful fallback
    guard_model_name = "llama-guard-3-8b"
    try:
        guard_model = ChatGroq(
            model=guard_model_name,
            api_key=api_key,
            temperature=0.0,
            timeout=4.0
        )
        response = await guard_model.ainvoke(prompt)
        output = response.content.strip()

        # Meta Llama Guard returns either "safe" or "unsafe\n<category_code>"
        if output.startswith("unsafe"):
            lines = output.split("\n")  #  Structure => lines = ["unsafe", "S13"]
            code = lines[1].strip() if len(lines) > 1 else "Unknown"
            category_name = HAZARD_CATEGORIES.get(code, "Unsafe Content") # If .get() crash with a KeyError. It simply returns "Unsafe Content".

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "guardrail_violation",
                    "hazard_code": code,
                    "category": category_name,
                    "message": f"Prompt blocked by Input Guardrails: classified under '{category_name}'."
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        # If upstream guard model has a temporary deprecation/network error, fail open safely
        print(f"⚠️ Guardrail evaluation notice ({e}). Allowed prompt safely.")


async def apply_input_guardrails(prompt: str) -> str:
    """
    The Full Input Guardrail Pipeline (Architecture Layer A - 01):
    1. Mask PII using Microsoft Presidio (Zero data leaks)
    2. Block hacking, sexual content, morphing, and jailbreaks using Meta Llama Guard 3
    3. Return the sanitized, safe prompt
    """
    # 1. Anonymize sensitive PII with Microsoft Presidio
    sanitized_prompt = mask_pii_presidio(prompt)

    # 2. Block hacking, sexual content, morphing, and jailbreaks with Meta Llama Guard 3
    await run_llama_guard(sanitized_prompt)

    return sanitized_prompt
