import json
import logging
import sys
from typing import Dict, Any, List, Optional, Tuple
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage

from .manager import get_host_manager

logger = logging.getLogger("nexus.mcp_host.adapter")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("[NEXUS-MCP-ADAPTER] %(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def mcp_to_openai_tool(mcp_tool: Dict[str, Any]) -> Dict[str, Any]:
    """
    Translates an official MCP tool definition into standard OpenAI / Groq / Gemini
    function-calling format compatible with all major LLMs.
    """
    name = mcp_tool.get("name", "")
    description = mcp_tool.get("description", "")
    schema = mcp_tool.get("inputSchema", {})

    # Ensure schema has type object
    if not isinstance(schema, dict) or "type" not in schema:
        schema = {"type": "object", "properties": {}}

    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": schema
        }
    }


async def execute_with_mcp_tools(
    model_instance: Any,
    prompt: str,
    chat_history: Optional[List[BaseMessage]] = None,
    max_tool_turns: int = 4
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Universal Multi-Turn Agent Loop for all LLM providers (Groq, Gemini, OpenAI).
    
    1. Discovers tools from active MCP servers via HostManager.
    2. Binds tools to the model instance.
    3. Executes the prompt.
    4. If LLM requests tool execution:
       - Dispatches tool call via HostManager.call_tool()
       - Injects ToolMessage into context
       - Queries LLM again with results until completion or max_tool_turns.
    
    Returns:
      (final_answer_text, tools_executed_audit_log)
    """
    host_mgr = get_host_manager()
    mcp_tools = await host_mgr.get_all_tools()

    # If no MCP tools are connected or available, fall back to standard direct invocation
    if not mcp_tools:
        messages = list(chat_history) + [HumanMessage(content=prompt)] if chat_history else [HumanMessage(content=prompt)]
        resp = await model_instance.ainvoke(messages)
        return resp.content, []

    # 1. Format tools for the model
    openai_tools = [mcp_to_openai_tool(t) for t in mcp_tools]
    logger.info(f"Binding {len(openai_tools)} MCP tools to model: {[t['function']['name'] for t in openai_tools]}")

    # 2. Bind tools to model instance
    try:
        model_with_tools = model_instance.bind_tools(openai_tools)
    except Exception as e:
        logger.warning(f"Failed to bind tools to model ({e}). Executing prompt without tools.")
        messages = list(chat_history) + [HumanMessage(content=prompt)] if chat_history else [HumanMessage(content=prompt)]
        resp = await model_instance.ainvoke(messages)
        return resp.content, []

    # 3. Prepare message history
    messages: List[BaseMessage] = []
    if chat_history:
        messages.extend(chat_history)
    messages.append(HumanMessage(content=prompt))

    tools_executed: List[Dict[str, Any]] = []

    # 4. Multi-turn Agent Loop
    for turn in range(max_tool_turns):
        logger.info(f"Agent Loop turn {turn + 1}/{max_tool_turns} executing...")
        response = await model_with_tools.ainvoke(messages)
        messages.append(response)

        # Check if model requested tool calls ## getattr(object, attribute_name, default_value)
        tool_calls = getattr(response, "tool_calls", None) ## getattr() is used so that the code doesn't raise an AttributeError if the attribute doesn't exist.
        if not tool_calls:
            # hasattr(response, "content") → Checks whether response has an attribute named content.
            final_content = response.content if hasattr(response, "content") else str(response)
            return final_content, tools_executed

        logger.info(f"Model requested {len(tool_calls)} tool call(s): {[tc.get('name') for tc in tool_calls]}")

        # Execute each requested tool call through HostManager
        for tc in tool_calls:
            call_id = tc.get("id") or f"call_{len(tools_executed)}"
            tool_name = tc.get("name")
            tool_args = tc.get("args", {})

            logger.info(f"Dispatching tool '{tool_name}' with args: {tool_args}")
            try:
                result_output = await host_mgr.call_tool(tool_name, tool_args)
                result_str = str(result_output)
                status = "success"
            except Exception as ex:
                logger.error(f"Error executing MCP tool '{tool_name}': {ex}")
                result_str = json.dumps({"error": str(ex)})
                status = "error"

            tools_executed.append({
                "tool_name": tool_name,
                "arguments": tool_args,
                "output": result_str[:400],
                "status": status
            })

            # Append ToolMessage result so the LLM sees the data in next turn
            messages.append(ToolMessage(
                content=result_str,
                tool_call_id=call_id,
                name=tool_name
            ))

    # Fallback if max turns reached
    return getattr(messages[-1], "content", str(messages[-1])), tools_executed
