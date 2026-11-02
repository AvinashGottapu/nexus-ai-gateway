"""
MCP Host Package for Nexus AI Gateway.
Allows the gateway to act as an MCP Host and manage client connections
to external MCP servers (stdio processes or remote SSE endpoints).
"""

from .client import MCPClient, MCPClientError
from .manager import HostManager, get_host_manager
from .tool_adapter import mcp_to_openai_tool, execute_with_mcp_tools

__all__ = [
    "MCPClient",
    "MCPClientError",
    "HostManager",
    "get_host_manager",
    "mcp_to_openai_tool",
    "execute_with_mcp_tools"
]
