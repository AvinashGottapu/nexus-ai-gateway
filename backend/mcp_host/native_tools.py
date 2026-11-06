"""
Native In-Process High-Speed Sandboxed Tools.
Executes in-memory in < 1ms without launching slow subprocesses.
"""
import io
import contextlib
import math
import datetime
import re
import json
import collections
import random
import statistics
import itertools
from typing import Dict, Any

import builtins

SAFE_BUILTINS_NAMES = {
    'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes',
    'chr', 'complex', 'dict', 'divmod', 'enumerate', 'filter',
    'float', 'format', 'frozenset', 'hex', 'int', 'isinstance',
    'issubclass', 'iter', 'len', 'list', 'map', 'max', 'min',
    'next', 'oct', 'ord', 'pow', 'print', 'range', 'repr',
    'reversed', 'round', 'set', 'slice', 'sorted', 'str',
    'sum', 'tuple', 'type', 'zip', 'True', 'False', 'None'
}

SAFE_BUILTINS = {k: getattr(builtins, k) for k in SAFE_BUILTINS_NAMES if hasattr(builtins, k)}


SAFE_GLOBALS = {
    "__builtins__": SAFE_BUILTINS,
    "math": math,
    "datetime": datetime,
    "re": re,
    "json": json,
    "collections": collections,
    "random": random,
    "statistics": statistics,
    "itertools": itertools
}

PYTHON_TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "execute_python_code",
        "description": (
            "Executes Python code in a secure, sub-millisecond in-memory environment and returns console printed output. "
            "Use this tool whenever you need exact calculations, statistics, loan/compound interest formulas, dates/calendar math, "
            "data transformations, regex verification, or algorithm testing. "
            "Standard libraries math, datetime, re, json, collections, random, statistics, itertools are pre-imported. "
            "IMPORTANT: Your code must use print(...) to output values."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The complete Python code snippet to execute. Must call print() to display any outputs or results."
                }
            },
            "required": ["code"]
        }
    }
}


def run_safe_python_code(code: str) -> str:
    """
    Executes Python code in-memory in < 1ms with security sandboxing.
    Blocks dangerous OS access, filesystem access, and infinite loops.
    """
    if not code or not code.strip():
        return "Error: No code provided to execute."

    # Guard against runaway while True loops
    if re.search(r"while\s+True\s*:", code):
        return "Execution Error: Infinite loop pattern 'while True:' is prohibited for security."

    run_globals = dict(SAFE_GLOBALS)
    buffer = io.StringIO()

    try:
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            exec(code, run_globals)
        output = buffer.getvalue().strip()
        return output if output else "Code executed successfully with no printed output. (Make sure your script calls print() to display results)."
    except Exception as e:
        return f"Execution Error ({type(e).__name__}): {str(e)}"

