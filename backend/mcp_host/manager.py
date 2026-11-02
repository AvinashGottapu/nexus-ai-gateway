import os
import sys
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional, Tuple

from .client import MCPClient, MCPClientError

logger = logging.getLogger("nexus.mcp_host.manager")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("[NEXUS-MCP-MANAGER] %(asctime)s - %(levelname)s - %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "mcp_servers.json")


class HostManager:
    """
    Orchestrates multiple MCP Client connections simultaneously.
    Provides:
      - Dynamic server lifecycle management (connect/disconnect/reload)
      - Configuration persistence (mcp_servers.json)
      - Unified namespaced tool catalog ({server_name}__{tool_name})
      - Transparent tool dispatching to the correct server client
    """

    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or DEFAULT_CONFIG_PATH
        self.clients: Dict[str, MCPClient] = {}
        self.server_configs: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self.load_config()

    # -------------------------------------------------------------------------
    # CONFIGURATION MANAGEMENT
    # -------------------------------------------------------------------------

    def load_config(self) -> Dict[str, Any]:
        """Loads server definitions from disk or creates default."""
        if not os.path.exists(self.config_path):
            self.server_configs = {}
            logger.warning(f"Config file not found at {self.config_path}. Starting with empty servers.")
            return {}

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.server_configs = data.get("mcpServers", {})
            logger.info(f"Loaded {len(self.server_configs)} server configuration(s) from {self.config_path}.")
            return self.server_configs
        except Exception as e:
            logger.error(f"Failed to read MCP config from {self.config_path}: {e}")
            self.server_configs = {}
            return {}

    def save_config(self) -> bool:
        """Persists current server configurations back to disk."""
        try:
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump({"mcpServers": self.server_configs}, f, indent=2)
            logger.info(f"Saved {len(self.server_configs)} server configuration(s) to {self.config_path}.")
            return True
        except Exception as e:
            logger.error(f"Failed to save MCP config to {self.config_path}: {e}")
            return False

    # -------------------------------------------------------------------------
    # LIFECYCLE MANAGEMENT (START / STOP / RECONNECT)
    # -------------------------------------------------------------------------

    async def start_all(self) -> Dict[str, bool]:
        """
        Concurrently connects to all enabled servers defined in the configuration.
        Returns a dictionary of {server_name: success_boolean}.
        """
        async with self._lock:
            tasks = []
            server_names = []

            for name, cfg in self.server_configs.items():
                if not cfg.get("enabled", True): ## Checks whether the server is enabled.
                    logger.info(f"Skipping disabled server: '{name}'")
                    continue
                server_names.append(name)
                tasks.append(self._create_and_connect_client(name, cfg))

            if not tasks:
                return {}

            results = await asyncio.gather(*tasks, return_exceptions=True)
            # executes all connection coroutines concurrently
            status_map = {}
            for name, res in zip(server_names, results):  ## zip() pairs each server name with its corresponding connection result..
                if isinstance(res, Exception):
                    logger.error(f"Server '{name}' failed to start: {res}")
                    status_map[name] = False
                else:
                    status_map[name] = res

            logger.info(f"HostManager startup complete. Connected servers: {sum(status_map.values())}/{len(status_map)}")
            return status_map

    async def _create_and_connect_client(self, name: str, cfg: Dict[str, Any]) -> bool:
        """Helper to instantiate and connect a single MCPClient."""
        # If already connected, keep existing connection
        if name in self.clients:
            if self.clients[name].is_connected:
                return True
            await self.clients[name].close()
            del self.clients[name]

        client = MCPClient(
            name=name,
            command=cfg.get("command"),
            args=cfg.get("args"),
            env=cfg.get("env"),
            url=cfg.get("url"),
            timeout=float(cfg.get("timeout", 30.0))
        )

        try:
            await client.connect()
            self.clients[name] = client
            return True
        except Exception as e:
            logger.error(f"Could not connect to server '{name}': {e}")
            return False

    async def stop_all(self) -> None:
        """Gracefully disconnects all active MCP clients."""
        async with self._lock:
            tasks = [client.close() for client in self.clients.values()] ## NOT executed yet..
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True) ## Now executed => await tasks...
                ## asyncio.gather() executes all closing operations concurrently.
                ## return_exceptions=True ensures that one client's closing failure doesn't prevent collecting the
            self.clients.clear() # Removes all entries from the dictionary.
            logger.info("HostManager stopped all MCP client connections.")

    async def connect_server(self, name: str) -> bool:
        """Connects or restarts an individual server by name."""
        cfg = self.server_configs.get(name)
        if not cfg:
            raise ValueError(f"No configuration found for server '{name}'.")
        async with self._lock:
            return await self._create_and_connect_client(name, cfg)

    async def disconnect_server(self, name: str) -> bool:
        """Disconnects an individual running server without deleting its config."""
        async with self._lock:
            client = self.clients.pop(name, None)
            if client:
                await client.close()
                logger.info(f"Disconnected server '{name}'.")
                return True
            return False

    # -------------------------------------------------------------------------
    # DYNAMIC SERVER MANAGEMENT (ADD / REMOVE RUNTIME)
    # -------------------------------------------------------------------------

    async def add_server(self, name: str, config: Dict[str, Any], auto_connect: bool = True) -> bool:
        """
        Dynamically registers a new server configuration and optionally connects immediately.
        Persists changes to mcp_servers.json.
        """
        self.server_configs[name] = config
        self.save_config()

        if auto_connect and config.get("enabled", True):
            async with self._lock:
                return await self._create_and_connect_client(name, config)
        return True

    async def remove_server(self, name: str) -> bool:
        """Disconnects and permanently removes a server from configurations."""
        await self.disconnect_server(name)
        if name in self.server_configs:
            del self.server_configs[name]
            self.save_config()
            logger.info(f"Removed server '{name}' from configurations.")
            return True
        return False

    # -------------------------------------------------------------------------
    # UNIFIED TOOL AGGREGATION & NAMESPACING
    # -------------------------------------------------------------------------

    async def get_all_tools(self) -> List[Dict[str, Any]]:
        """
        Collects all tools from all currently connected servers.
        Namespaces each tool as: '{server_name}__{tool_name}' to prevent conflicts.
        """
        aggregated_tools = []

        for server_name, client in self.clients.items():
            if not client.is_connected:
                continue

            for tool in client.tools:
                orig_name = tool.get("name", "")
                namespaced_name = f"{server_name}__{orig_name}"
                desc = tool.get("description", "")
                namespaced_desc = f"[Server: {server_name}] {desc}"

                aggregated_tools.append({
                    "name": namespaced_name,
                    "original_name": orig_name,
                    "server_name": server_name,
                    "description": namespaced_desc,
                    "inputSchema": tool.get("inputSchema", {"type": "object", "properties": {}})
                })

        return aggregated_tools

    # -------------------------------------------------------------------------
    # TRANSPARENT TOOL DISPATCHER
    # -------------------------------------------------------------------------

    async def call_tool(self, namespaced_tool_name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """
        Routes and executes a namespaced tool call to the appropriate client.
        Supports:
          1. Namespaced: 'github__search_repositories' -> sends 'search_repositories' to client 'github'
          2. Non-namespaced fallback: 'search_repositories' -> searches connected clients for a match
        """
        server_name, orig_tool_name = self._resolve_tool_target(namespaced_tool_name)

        client = self.clients.get(server_name)
        if not client or not client.is_connected:
            raise MCPClientError(f"Target MCP server '{server_name}' is not running or connected.")

        logger.info(f"HostManager dispatching tool call -> server: '{server_name}', tool: '{orig_tool_name}'")
        return await client.call_tool(orig_tool_name, arguments or {})

    def _resolve_tool_target(self, tool_name: str) -> Tuple[str, str]:
        """Resolves target server and tool name from input string."""
        if "__" in tool_name:
            parts = tool_name.split("__", 1)
            return parts[0], parts[1]

        # Fallback: search across all clients
        for s_name, client in self.clients.items():
            for t in client.tools:
                if t.get("name") == tool_name:
                    return s_name, tool_name

        raise MCPClientError(f"Tool '{tool_name}' not found on any active MCP server.")

    # -------------------------------------------------------------------------
    # STATUS & OBSERVABILITY
    # -------------------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        """Returns runtime status of all configured and running servers."""
        server_reports = []

        for name, cfg in self.server_configs.items():
            client = self.clients.get(name)
            is_active = client.is_connected if client else False
            tool_count = len(client.tools) if client and is_active else 0
            transport = cfg.get("url") and "sse" or "stdio"

            server_reports.append({
                "name": name,
                "transport": transport,
                "enabled": cfg.get("enabled", True),
                "connected": is_active,
                "tool_count": tool_count,
                "tools": [t.get("name") for t in (client.tools if client else [])],
                "server_info": client.server_info if client else {}
            })

        total_tools = sum(s["tool_count"] for s in server_reports)

        return {
            "total_configured": len(self.server_configs),
            "total_connected": sum(1 for s in server_reports if s["connected"]),
            "total_tools_available": total_tools,
            "servers": server_reports
        }


# Global singleton instance for platform-wide access
_global_host_manager: Optional[HostManager] = None


def get_host_manager() -> HostManager:
    """Returns the platform-wide HostManager singleton."""
    global _global_host_manager
    if _global_host_manager is None:
        _global_host_manager = HostManager()
    return _global_host_manager
