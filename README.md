# ⚡ Nexus AI Gateway

> **Production-grade LLM Gateway & Smart Router featuring Redis sliding-window rate limiting, Microsoft Presidio PII masking, Meta Llama Guard 3, semantic vector caching, and automatic provider failover.**

---

## 🏛️ The Architecture Pipeline

```mermaid
flowchart TD
    Client["Developer Client App\n(Web, Mobile, Agent, Python)"] --> Gateway["02 API Gateway & Identity\n• SHA-256 Key Hashing\n• Prepaid Credit Wallet ($5.00 starter)\n• Redis Sliding-Window Rate Limiter (ZSET)"]
    Gateway --> Guardrails["01 Input Guardrails\n• Microsoft Presidio (PII Masking)\n• Meta Llama Guard 3 (Hacking, Sexual, Morphing, Jailbreaks)"]
    Guardrails --> SemCache{"03 Semantic Cache\n(Redis Cosine Similarity >= 0.90)"}
    
    SemCache -- "CACHE HIT (10ms / $0.00)" --> Output["Answer Delivered (LLM Bypassed!)"]
    
    SemCache -- "CACHE MISS" --> Router["04 Router + Orchestrator\n• Intent Classification\n• Dynamic Model Routing (auto, fast, cheap)"]
    
    Router --> ModelGateway["07 Model Gateway & Fallback\n• Circuit Breaker Failover\nPrimary (Groq) ➔ Backup 1 (Gemini) ➔ Backup 2 (OpenAI)"]
    
    ModelGateway --> WriteCache["Write (prompt, vector, answer)\nto Redis with 24h TTL"]
    WriteCache --> Deduct["Dynamic Token Cost Deduction from Wallet"]
    Deduct --> Output
```

---

## ✨ Core Features

### 1. 02 API Gateway & Identity
- **Cryptographic Key Hashing (SHA-256)**: Plaintext developer keys (`sk-live-...`) are never stored in the database.
- **Prepaid Credit Wallet**: Developers receive **$5.00** in free starter credits. Real-time balance check rejects exhausted keys with `402 Payment Required: Insufficient Quota`.
- **Distributed Redis Sliding-Window Rate Limiter**: High-concurrency atomic pipeline using Redis Sorted Sets (`ZSET`).

### 2. 01 Input Guardrails
- **Microsoft Presidio**: Context-aware named-entity recognition automatically redacts Real Names (`<PERSON>`), Credit Cards (`<CREDIT_CARD>`), Phone Numbers (`<PHONE_NUMBER>`), Emails (`<EMAIL_ADDRESS>`), and SSNs.
- **Meta Llama Guard 3 (on Groq)**: Sub-100ms classifier trained on the 14 official MLCommons hazard categories (Cyberattacks/Hacking `S13`, Sexual Content `S12`, Defamation/Morphing `S5`, Violent Crimes `S1`, and adversarial prompt injections).

### 3. 03 Semantic Cache (Redis)
- Uses mathematical **Cosine Similarity** ($\ge 0.90$) to detect semantically identical questions.
- **Cache Hit**: Instant response in **$\sim 10\text{ms}$** at **\$0.00 cost** (upstream LLM is completely bypassed).
- **Cache Miss**: LLM responds and automatically caches `(prompt, vector, answer)` in Redis with a 24-hour expiration timer (TTL).

### 4. 04 Router + Orchestrator & Model Gateway
- **Smart Model Aliases**:
  - `model="auto"`: Dynamically routes simple questions to low-cost models and complex reasoning to flagship models.
  - `model="fast"`: Routes to Groq Llama 3.3 for sub-second speed.
  - `model="cheap"`: Routes to Gemini 1.5 Flash.
- **Automatic Fallback Circuit Breaker**: If the primary provider hits a `429 Rate Limit` or `503 Outage`, the gateway automatically retries on backup providers without failing the user's call.

---

## 🚀 Quickstart

### 1. Clone & Setup Environment
```bash
git clone https://github.com/AvinashGottapu/nexus-ai-gateway.git
cd nexus-ai-gateway

# Create virtual environment
uv venv
```

### 2. Install Dependencies
```bash
uv pip install -r requirements.txt
```

### 3. Configure `.env`
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```
```env
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
REDIS_URL=rediss://default:...@your-redis-host:6379
```

### 4. Run the Server
```bash
uv run uvicorn main:app --reload --port 8000
```
Open interactive Swagger docs at: `http://localhost:8000/docs`

---

## 📡 API Reference

### 1. Generate Platform API Key
```bash
curl -X POST http://127.0.0.1:8000/v1/keys/create \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "starter_credits": 5.0, "rpm_limit": 30}'
```

### 2. Check Wallet Balance
```bash
curl -X GET http://127.0.0.1:8000/v1/keys/balance \
  -H "Authorization: Bearer sk-live-YOUR_KEY"
```

### 3. Protected Chat Inference
```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Authorization: Bearer sk-live-YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is Docker?", "provider": "groq"}'
```

---

## 📄 License
MIT License. Built for production-grade AI infrastructure.
