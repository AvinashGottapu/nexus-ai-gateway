"""
Launcher script for Nexus AI Backend Platform.
Automatically selects ProactorEventLoop on Windows so MCP stdio subprocesses
(like nexus-local and github-tools) work properly under uvicorn reload.
"""
import sys
import uvicorn

if __name__ == "__main__":
    loop_flag = "asyncio:ProactorEventLoop" if sys.platform == "win32" else "auto"
    print(f"[*] Starting Nexus Gateway with loop='{loop_flag}' on http://127.0.0.1:8000 ...")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False, loop=loop_flag)
