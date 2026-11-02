import os
import sys
import json
import shutil
import asyncio
import logging
from typing import Dict, Any, List, Optional, Union
import httpx

## getLogger() retrieves a logger with the specified name. If it doesn't exist, Python creates one.
logger = logging.getLogger("nexus.mcp_host.client")

# A logger can have multiple handlers. => A handler determines where the logs are sent.
## EG : Terminal, File, Remote logging service,..
if not logger.handlers:
    handler = logging.StreamHandler(sys.stderr) ## Diagnostic logs, warnings and errors. Kept separate from protocol messages.
    handler.setFormatter(logging.Formatter("[NEXUS-MCP-CLIENT] %(asctime)s - %(levelname)s - %(message)s")) 
    ## The prefix helps you identify the component that generated the log.
    logger.addHandler(handler) ## This line connects the handler to your logger.
    logger.setLevel(logging.INFO)
    ## By setting INFO, you allow INFO, WARNING, ERROR and CRITICAL messages through the logger. => DEBUG messages are ignored.
    ## DEBUG -> VALUE IS 10; INFO -> 20; ERROR -> 40; ..... 

class MCPClientError(Exception):
    """Base exception for MCP client operations."""
    pass


class MCPClient:
    """
    Universal Model Context Protocol (MCP) Client.
    Supports both:
      1. Local Stdio Subprocesses (command + args)
      2. Remote SSE / HTTP Endpoints (url)
    Implements official Anthropic MCP JSON-RPC 2.0 protocol specifications.
    """

    def __init__(
        self,
        name: str,
        command: Optional[str] = None,
        args: Optional[List[str]] = None,
        env: Optional[Dict[str, str]] = None,
        url: Optional[str] = None,
        timeout: float = 30.0
    ):
        self.name = name
        self.url = url.rstrip("/") if url else None
        self.command = command
        self.args = args or []
        self.env = env or {}
        self.timeout = timeout

        # Determine transport mode
        if self.url:
            self.transport = "sse"
        elif self.command:
            self.transport = "stdio"
        else:
            raise ValueError(f"MCPClient '{name}' must have either a 'command' (for stdio) or a 'url' (for SSE).")

        self.is_connected = False
        self.server_info: Dict[str, Any] = {}
        self.server_capabilities: Dict[str, Any] = {}
        self.tools: List[Dict[str, Any]] = []

        # Internal stdio state
        self._process: Optional[asyncio.subprocess.Process] = None
        self._msg_id = 0
        self._pending_requests: Dict[Union[int, str], asyncio.Future] = {}
        self._stdio_reader_task: Optional[asyncio.Task] = None

        # Internal SSE / HTTP state
        self._http_client: Optional[httpx.AsyncClient] = None
        self._sse_post_endpoint: Optional[str] = None
        self._sse_listener_task: Optional[asyncio.Task] = None

    def _next_id(self) -> int:
        self._msg_id += 1
        return self._msg_id

    # -------------------------------------------------------------------------
    # LIFECYCLE: CONNECT & HANDSHAKE
    # -------------------------------------------------------------------------

    async def connect(self) -> bool:
        """
        Establishes connection to the MCP server (spawns stdio process or opens SSE stream),
        executes official 'initialize' handshake, and retrieves tool definitions.
        """
        if self.is_connected:
            return True

        logger.info(f"Connecting to MCP server '{self.name}' via [{self.transport.upper()}]...")

        try:
            if self.transport == "stdio":
                await self._start_stdio()
            else:
                await self._start_sse()

            # Execute standard handshake
            await self._handshake()

            # Discover capabilities
            self.tools = await self.list_tools()
            self.is_connected = True
            logger.info(f"Successfully connected to '{self.name}'. Discovered {len(self.tools)} tool(s).")
            return True

        except Exception as e:
            logger.error(f"Failed to connect to MCP server '{self.name}': {e}", exc_info=True)
            await self.close()
            raise MCPClientError(f"Connection to '{self.name}' failed: {e}") from e

    async def _handshake(self) -> None:
        """Executes official MCP initialize handshake and initialized notification."""
        init_request = {
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {},
                    "resources": {}
                },
                "clientInfo": {
                    "name": "nexus-ai-gateway-host",
                    "version": "1.0.0"
                }
            }
        }

        res = await self._send_request(init_request)
        result = res.get("result", {})
        self.server_info = result.get("serverInfo", {})
        self.server_capabilities = result.get("capabilities", {})
        logger.info(f"Handshake complete with '{self.name}'. Server Info: {self.server_info}")

        # Send notifications/initialized (notification without response per spec)
        await self._send_notification({"method": "notifications/initialized", "params": {}})

    # -------------------------------------------------------------------------
    # STDIO TRANSPORT ENGINE
    # -------------------------------------------------------------------------

    async def _start_stdio(self) -> None:
        """Launches the external MCP server child process over standard I/O."""
        merged_env = os.environ.copy()
        merged_env.update(self.env) # Copies existing system environment variables and merges in any custom tokens
        merged_env["PYTHONIOENCODING"] = "utf-8" # Guarantees emojis, special characters, and Unicode don't crash the Windows pipe.
        merged_env["PYTHONUNBUFFERED"] = "1" # Forces the child process to send its output immediately

        # Resolve command path on Windows (e.g. npx -> npx.cmd, python -> sys.executable)
        exec_cmd = self.command
        if exec_cmd in ("python", "python3") or (exec_cmd and not os.path.isabs(exec_cmd) and "python" in exec_cmd.lower()):
            exec_cmd = sys.executable
        elif exec_cmd:
            resolved = shutil.which(exec_cmd)
            if resolved:
                exec_cmd = resolved

        cmd_full = [exec_cmd] + self.args
        logger.info(f"Spawning stdio process for '{self.name}': {' '.join(cmd_full)}")

        try:
            self._process = await asyncio.create_subprocess_exec( # Launches the program
                exec_cmd,
                *self.args,
                stdin=asyncio.subprocess.PIPE, # Sets up 3 separate operating system pipes
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=merged_env
            )
        except NotImplementedError:
            err_msg = (
                f"Windows SelectorEventLoop does not support subprocesses for '{self.name}'. "
                "Restart the server with: uvicorn main:app --reload --loop asyncio:ProactorEventLoop "
                "or run: python run.py"
            )
            logger.error(f"[{self.name}] {err_msg}")
            raise MCPClientError(err_msg)

        ## asyncio.create_task: Starts two background workers running in parallel
        # Start continuous reader tasks for stdout (JSON-RPC) and stderr (diagnostics)
        self._stdio_reader_task = asyncio.create_task(self._stdio_stdout_reader())
        asyncio.create_task(self._stdio_stderr_reader())

    async def _stdio_stdout_reader(self) -> None:
        """Reads JSON-RPC responses from server stdout continuously."""
        if not self._process or not self._process.stdout:
            return

        try:
            while True:
                line_bytes = await self._process.stdout.readline()
                ## Asynchronously waits until the server outputs a full line ending in \n..
                if not line_bytes:
                    break  # Process terminated or EOF

                line_str = line_bytes.decode("utf-8", errors="replace").strip() # Decodes the raw bytes into a string..
                if not line_str:
                    continue

                try:
                    msg = json.loads(line_str)
                except json.JSONDecodeError:
                    logger.warning(f"[{self.name}] Discarded non-JSON output: {line_str[:120]}")
                    continue

                msg_id = msg.get("id")
                if msg_id is not None and msg_id in self._pending_requests:
                    fut = self._pending_requests.pop(msg_id)
                    if not fut.done():
                        fut.set_result(msg) ## set_result() is a 100% BUILT-IN method in Python!
                        ## Marks the Future as successful, stores value, and wakes up the await.
                        ## In JavaScript: You use resolve(data) inside a Promise.
                        # In Python: You use future.set_result(data).
                else:
                    logger.debug(f"[{self.name}] Received server push/notification: {msg.get('method')}")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[{self.name}] Stdio reader loop encountered error: {e}")

    async def _stdio_stderr_reader(self) -> None:
        """Logs server stderr stream without interrupting stdout JSON-RPC."""
        if not self._process or not self._process.stderr:
            return

        try:
            while True:
                err_line = await self._process.stderr.readline()
                if not err_line:
                    break
                text = err_line.decode("utf-8", errors="replace").strip()
                if text:
                    logger.info(f"[{self.name}:stderr] {text}")
        except Exception:
            pass

    # -------------------------------------------------------------------------
    # REMOTE SSE / HTTP TRANSPORT ENGINE
    # -------------------------------------------------------------------------

    async def _start_sse(self) -> None:
        """Connects to remote MCP Server-Sent Events (SSE) endpoint."""
        self._http_client = httpx.AsyncClient(timeout=self.timeout) ## Creates an asynchronous HTTP client using httpx.
        sse_url = self.url if self.url.endswith("/sse") else f"{self.url}/sse"

        logger.info(f"Connecting to remote SSE endpoint: {sse_url}")

        # Start background task to consume SSE stream
        ready_event = asyncio.Event()
        self._sse_listener_task = asyncio.create_task(self._sse_stream_listener(sse_url, ready_event))

        # Wait for SSE connection and endpoint assignment
        try:
            await asyncio.wait_for(ready_event.wait(), timeout=self.timeout)
        except asyncio.TimeoutError:
            raise MCPClientError(f"Timed out connecting to remote SSE endpoint at {sse_url}")

    async def _sse_stream_listener(self, sse_url: str, ready_event: asyncio.Event) -> None:
        """Consumes Server-Sent Events from the remote server."""
        try:
            async with self._http_client.stream("GET", sse_url) as response: # This sends an HTTP GET request to the given URL.
                if response.status_code != 200:
                    raise MCPClientError(f"SSE connection rejected with HTTP {response.status_code}")

                # Default endpoint for sending messages if not explicitly given by endpoint event
                self._sse_post_endpoint = self.url.replace("/sse", "") + "/messages" 
                ready_event.set() 
                ## it signals that the event has occurred, and any coroutine waiting on ready_event.wait() can resume.

                buffer = ""
                # NEXUS MCP Host is continuously reading incoming text from the MCP server, identifying complete SSE events, and processing them one by one.
                async for chunk in response.aiter_text(): # Continuously receive chunks..
                    buffer += chunk
                    while "\n\n" in buffer:
                        ## Every SSE event is terminated by a blank line (\n\n). This is part of the SSE protocol specification.
                        event_block, buffer = buffer.split("\n\n", 1)
                        ## Getting every event..
                        self._process_sse_event_block(event_block)
                        ## Its job is to take one complete SSE event, understand what type of event it is, and then perform the appropriate action.

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[{self.name}] SSE stream disconnected: {e}")
            ready_event.set()

    def _process_sse_event_block(self, block: str) -> None:
        """Parses an individual SSE block for endpoints or messages."""
        lines = block.splitlines()
        event_type = "message"
        data_str = ""

        for line in lines:
            if line.startswith("event:"):
                event_type = line[6:].strip()
            elif line.startswith("data:"):
                data_str += line[5:].strip()

        if event_type == "endpoint":
            # The server tells us where to POST JSON-RPC messages
            target = data_str.strip()
            if target.startswith("http"):
                self._sse_post_endpoint = target
            else:
                base = self.url.rstrip("/")
                self._sse_post_endpoint = f"{base}/{target.lstrip('/')}"
            logger.info(f"[{self.name}] Configured SSE POST endpoint: {self._sse_post_endpoint}")

        elif event_type == "message" and data_str:
            try:
                msg = json.loads(data_str)
                msg_id = msg.get("id")
                if msg_id is not None and msg_id in self._pending_requests:
                    fut = self._pending_requests.pop(msg_id)
                    if not fut.done():
                        fut.set_result(msg)
            except Exception as e:
                logger.warning(f"[{self.name}] Failed to parse SSE message JSON: {e}")

    # -------------------------------------------------------------------------
    # UNIVERSAL REQUEST / NOTIFICATION DISPATCHER
    # -------------------------------------------------------------------------

    ## This is the central request-dispatching function of your NEXUS MCP Client.
    async def _send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatches a JSON-RPC request and awaits the matching response."""
#         payload = {
#     "method": "tools/call",
#     "params": {
#         "name": "add",
#         "arguments": {"a": 10, "b": 20}
#     }
# }

        req_id = self._next_id()
        payload["jsonrpc"] = "2.0"
        payload["id"] = req_id

        future = asyncio.get_running_loop().create_future() ## future.done()  # False
        self._pending_requests[req_id] = future

        try:
            if self.transport == "stdio":
                if not self._process or not self._process.stdin:
                    raise MCPClientError(f"Stdio process for '{self.name}' is not running.")
                line = json.dumps(payload) + "\n" ## json.dumps() converts the Python dictionary into a JSON string:
                self._process.stdin.write(line.encode("utf-8"))
                await self._process.stdin.drain()

            elif self.transport == "sse":
                if not self._http_client or not self._sse_post_endpoint:
                    raise MCPClientError(f"SSE client for '{self.name}' is not connected.")
                ## This sends the JSON-RPC payload in the HTTP request body.
                resp = await self._http_client.post(self._sse_post_endpoint, json=payload)
                if resp.status_code not in (200, 202):
                    raise MCPClientError(f"HTTP error posting to {self._sse_post_endpoint}: {resp.status_code} {resp.text}")

            # Await response matching req_id
            ## Wait until this Future receives its result, but don't wait longer than the configured timeout.
            response = await asyncio.wait_for(future, timeout=self.timeout)

            if "error" in response:
                err = response["error"]
                raise MCPClientError(f"MCP Server error ({err.get('code')}): {err.get('message')}")

            return response

        except asyncio.TimeoutError:
            self._pending_requests.pop(req_id, None)
            raise MCPClientError(f"Request '{payload.get('method')}' to '{self.name}' timed out after {self.timeout}s.")
        except Exception as e:
            self._pending_requests.pop(req_id, None)
            raise

    async def _send_notification(self, payload: Dict[str, Any]) -> None:
        ## Send only; no JSON-RPC response expected.
        """Dispatches a one-way notification without awaiting a response."""
        payload["jsonrpc"] = "2.0"
        if "id" in payload:
            del payload["id"]

        try:
            if self.transport == "stdio" and self._process and self._process.stdin:
                line = json.dumps(payload) + "\n"
                self._process.stdin.write(line.encode("utf-8"))
                await self._process.stdin.drain()

            elif self.transport == "sse" and self._http_client and self._sse_post_endpoint:
                await self._http_client.post(self._sse_post_endpoint, json=payload)
        except Exception as e:
            logger.warning(f"[{self.name}] Failed to send notification {payload.get('method')}: {e}")

    # -------------------------------------------------------------------------
    # PUBLIC TOOL ACTIONS
    # -------------------------------------------------------------------------

    async def list_tools(self) -> List[Dict[str, Any]]:
        """Retrieves all tools registered on the server."""
        req = {"method": "tools/list", "params": {}}
        resp = await self._send_request(req)
        tools = resp.get("result", {}).get("tools", [])
        self.tools = tools
        return tools

    async def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """
        Executes a named tool on the server with arguments.
        Returns the parsed result content (text or structured data).
        """
        req = {
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments or {}
            }
        }
        resp = await self._send_request(req)
        result = resp.get("result", {})
        content = result.get("content", [])

        # Format content pieces into clean output
        text_outputs = []
        for item in content:
            if item.get("type") == "text":
                text_outputs.append(item.get("text", ""))
            else:
                text_outputs.append(json.dumps(item))

        return "\n".join(text_outputs) if text_outputs else result

    # -------------------------------------------------------------------------
    # PUBLIC RESOURCE ACTIONS
    # -------------------------------------------------------------------------

    async def list_resources(self) -> List[Dict[str, Any]]:
        """Retrieves available resources from the server."""
        req = {"method": "resources/list", "params": {}}
        resp = await self._send_request(req)
        return resp.get("result", {}).get("resources", [])

    async def read_resource(self, uri: str) -> List[Dict[str, Any]]:
        """Reads the content of a specific resource URI."""
        req = {"method": "resources/read", "params": {"uri": uri}}
        resp = await self._send_request(req)
        return resp.get("result", {}).get("contents", [])

    # -------------------------------------------------------------------------
    # TEARDOWN
    # -------------------------------------------------------------------------

    async def close(self) -> None:
        """Gracefully terminates the child process or closes the HTTP session."""
        self.is_connected = False

        # 1. Clean up pending futures
        for fut in self._pending_requests.values():
            if not fut.done():
                fut.cancel()
        self._pending_requests.clear()

        # 2. Cancel reader tasks
        if self._stdio_reader_task and not self._stdio_reader_task.done():
            self._stdio_reader_task.cancel()
        if self._sse_listener_task and not self._sse_listener_task.done():
            self._sse_listener_task.cancel()

        # 3. Clean up stdio child process
        if self._process:
            try:
                if self._process.returncode is None:
                    self._process.terminate()
                    try:
                        await asyncio.wait_for(self._process.wait(), timeout=2.0)
                    except asyncio.TimeoutError:
                        self._process.kill()
                        await self._process.wait()
            except Exception as e:
                logger.warning(f"Error terminating process for '{self.name}': {e}")
            finally:
                self._process = None

        # 4. Clean up HTTP client
        if self._http_client:
            try:
                await self._http_client.aclose()
            except Exception:
                pass
            finally:
                self._http_client = None

        logger.info(f"Closed connection to MCP server '{self.name}'.")

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
