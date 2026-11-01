import os
import sys
import json
import asyncio
from typing import Dict, Any, List, Optional

# Set up paths so we can import internal gateway modules directly
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# Ensure standard output and error use UTF-8 on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def log_debug(message: str):
    """Logs internal debug diagnostics strictly to stderr so stdout remains clean JSON-RPC."""
    sys.stderr.write(f"[NEXUS-MCP] {message}\n") ##  PIPE 2: sys.stderr =>  (The "Log & Human" Pipe)
    sys.stderr.flush() 


# --- 1. DYNAMIC OPENAPI SCHEMA INTROSPECTION ---

def get_openapi_tool_schemas() -> List[Dict[str, Any]]:
    """
    Returns platform capabilities matching the certified Anthropic Model Context Protocol (MCP) tool contracts.
    Executes in 0.0ms with zero network or heavy import latency.
    """
    properties = {
        "prompt": {
            "type": "string",
            "description": "The user query or instructions to process."
        },
        "provider": {
            "type": "string",
            "description": "Model target: 'auto' (Pareto-optimal SLA router), 'groq', 'gemini', or 'openai'.",
            "default": "auto"
        }
    }

    ## If an MCP server returns a tool without an inputSchema (even if it takes no arguments, where you provide "inputSchema": {"type": "object", "properties": {}}), Claude Desktop and Cursor will reject the tool during the handshake and will not show it in the UI.

    return [
        {
            "name": "query_nexus_gateway",
            "description": (
                "Execute an enterprise AI query through Nexus Gateway. "
                "Features automated Presidio PII Masking, Upstash Semantic Cosine Caching ($0.00 zero-shot return), "
                "and Pareto-Optimal 3-Tier Routing: Groq (code syntax), OpenAI (reasoning/math), and Gemini Flash (normal chat)."
            ),
            "inputSchema": {
                "type": "object",
                "properties": properties,
                "required": ["prompt"]
            }
        },
        {
            "name": "get_cluster_observability",
            "description": (
                "Fetch real-time enterprise telemetry and rolling 1-hour sorted-set metrics from Upstash Redis: "
                "P50/P95/P99 latency percentiles, total requests routed, cumulative cost avoidance (USD), and active circuit breaker states."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        },
        {
            "name": "search_knowledge_rag",
            "description": (
                "Search the 2-Hour Ephemeral Knowledge Store using Cosine Vector Similarity. "
                "Returns verified company policies, documentation passages, and citation sources."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The question or concept to search for in the verified knowledge base."
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of relevant context chunks to retrieve (default: 2).",
                        "default": 2
                    }
                },
                "required": ["query"] 
                # Tells the LLM: You cannot call this tool without a query, but top_k is optional.
            }
        },
        {
            "name": "list_api_keys",
            "description": "Retrieve all active tenant API keys, assigned rate limits (RPM), and remaining wallet balances in USD.",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }
    ]


# --- 2. DIRECT IN-PROCESS TOOL EXECUTOR ---

async def execute_mcp_tool(name: str, arguments: Dict[str, Any]) -> str:
    """
    Executes tool calls directly through the gateway pipeline with zero HTTP networking overhead.
    """
    if name == "query_nexus_gateway":
        from orchestrator.router import orchestrate_request
        from guardrails.input_guard import apply_input_guardrails

        prompt = arguments.get("prompt", "")
        model = arguments.get("provider", "auto")

        try:
            safe_prompt = await apply_input_guardrails(prompt)
            res = await orchestrate_request(safe_prompt, requested_model=model)
            
            output = {
                "status": "success",
                "response": res.get("response"),
                "intent": res.get("intent"),
                "sub_intent": res.get("sub_intent"),
                "provider_used": res.get("provider_used"),
                "savings_badge": res.get("savings_badge"),
                "failover_triggered": res.get("failover_triggered", False),
                "pii_masked": safe_prompt != prompt,
                "anonymized_prompt": safe_prompt
            }
            return json.dumps(output, indent=2)
        except Exception as e:
            return json.dumps({"status": "error", "message": str(e)})

    elif name == "get_cluster_observability":
        from observability.tracer import get_gateway_metrics
        try:
            metrics = await get_gateway_metrics()
            return json.dumps(metrics, indent=2)
        except Exception as e:
            return json.dumps({"status": "error", "message": str(e)})

    elif name == "search_knowledge_rag":
        from orchestrator.rag import search_temporary_knowledge
        query = arguments.get("query", "")
        top_k = arguments.get("top_k", 2)
        try:
            chunks = await search_temporary_knowledge(query, top_k=top_k)
            return json.dumps({"status": "success", "retrieved_chunks": chunks}, indent=2)
        except Exception as e:
            return json.dumps({"status": "error", "message": str(e)})

    elif name == "list_api_keys":
        from auth.keys import get_all_api_keys
        try:
            keys = get_all_api_keys()
            safe_keys = []
            for k in keys:
                safe_keys.append({
                    "id": k.get("id"),
                    "name": k.get("name"),
                    "tier": k.get("tier"),
                    "rpm_limit": k.get("rpm_limit"),
                    "balance_usd": k.get("balance_usd"),
                    "status": "active" if k.get("is_active") else "revoked"
                })
            return json.dumps(safe_keys, indent=2)
        except Exception as e:
            return json.dumps({"status": "error", "message": str(e)})

    return json.dumps({"error": f"Tool '{name}' not recognized."})


# --- 3. MCP PROTOCOL DISPATCHER (JSON-RPC 2.0) ---

async def handle_mcp_message(request: Dict[str, Any], tools: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    method = request.get("method")
    msg_id = request.get("id")

    ## The Host (Claude Desktop / Cursor) calls all of these automatically on its own!

    # [ HOST: Claude / Cursor ]                               [ MCP SERVER: Your Python Script ]
    #         │                                                               │
    #         │────── 1. {"method": "initialize"} ───────────────────────────>│ (Host asks: "Who are you?")
    #         │<───── {"serverInfo": {"name": "nexus-ai-gateway"}} ───────────│ (Server: "I am Nexus Gateway v1.0")
    #         │                                                               │
    #         │────── 2. {"method": "notifications/initialized"} ────────────>│ (Host acknowledges: "Handshake done!")
    #         │                                                               │
    #         │────── 3. {"method": "tools/list"} ───────────────────────────>│ (Host asks: "What tools do you have?")
    #         │<───── {"tools": [query_nexus, observability, ...]} ───────────│ (Server returns the 4 tools)
    #         │                                                               │
    #         │────── 4. {"method": "resources/list"} ───────────────────────>│ (Host asks: "Any documents/data streams?")
    #         │<───── {"resources": ["gateway://telemetry"]} ─────────────────│ (Server returns the live telemetry URI)

    # 1. Initialize
    if method == "initialize":
        log_debug("MCP Handshake: 'initialize'")
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {},
                    "resources": {}
                },
                "serverInfo": {
                    "name": "nexus-ai-gateway",
                    "version": "1.0.0"
                }
            }
        }

    # 2. Notification (no response per spec)
    elif method == "notifications/initialized":
        log_debug("MCP Notification: 'initialized'")
        return None

    # 3. Ping
    elif method == "ping":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {}
        }

    # 4. List Tools
    elif method == "tools/list":
        log_debug("MCP Discovery: 'tools/list'")
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "tools": tools
            }
        }

    # 5. Call Tool
    elif method == "tools/call":
        params = request.get("params", {})
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        log_debug(f"MCP Execute: 'tools/call' -> '{tool_name}'")

        output_text = await execute_mcp_tool(tool_name, arguments)
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": output_text
                    }
                ]
            }
        }

    # 6. Resources List
    elif method == "resources/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "resources": [
                    {
                        "uri": "gateway://telemetry",
                        "name": "Nexus Gateway Live Telemetry",
                        "description": "Live P50/P95 rolling latencies and cluster status."
                    }
                ]
            }
        }

    # 6b. Resource Templates List
    elif method == "resources/templates/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "resourceTemplates": []
            }
        }

    # 6c. Prompts List
    elif method == "prompts/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "prompts": []
            }
        }

    # 7. Resources Read
    elif method == "resources/read":
        from observability.tracer import get_gateway_metrics
        try:
            metrics = await get_gateway_metrics()
            content_text = json.dumps(metrics, indent=2)
        except Exception as e:
            content_text = json.dumps({"error": str(e)})

        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "contents": [
                    {
                        "uri": "gateway://telemetry",
                        "mimeType": "application/json",
                        "text": content_text
                    }
                ]
            }
        }

    # Unknown Method
    return {
        "jsonrpc": "2.0",
        "id": msg_id,
        "error": {
            "code": -32601,
            "message": f"Method '{method}' not implemented."
        }
    }


# --- 4. STDIO JSON-RPC 2.0 ENGINE ---

def main():
    log_debug("Nexus Gateway MCP Server starting over stdio...")
    tools = get_openapi_tool_schemas() ## Startup & Loading Tools   
    log_debug(f"Loaded {len(tools)} MCP tools (query_nexus_gateway, get_cluster_observability, search_knowledge_rag, list_api_keys)")

    while True:
        line = sys.stdin.readline()  ## It tells Python: "Freeze and wait until Claude sends a message."
        if not line: ## If you close Claude Desktop or Cursor...
            break

        line_str = line.strip()  ## Safety Checks & JSON Parsing (It trims whitespace.)
        if not line_str:
            continue

        try:
            request = json.loads(line_str)
        except json.JSONDecodeError as jde: ## If Claude sent corrupted text, it logs the error to stderr and stays alive without crashing.
            log_debug(f"Invalid JSON: {jde}")
            continue

        response = asyncio.run(handle_mcp_message(request, tools))
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n") ##  PIPE 1: sys.stdout  =>   (The "Data & Protocol" Pipe) 
            sys.stdout.flush()
           


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, SystemExit):
        log_debug("Nexus Gateway MCP Server terminated.")
