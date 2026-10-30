import os
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from langchain_core.tools import tool

# =====================================================================
# 06 COMMERCE TOOLS (Tavily Real-Time Web Search & URL Extraction)
# =====================================================================

# --- 1. TYPED SCHEMAS (Pydantic validation for LLM arguments) ---

class TavilySearchInput(BaseModel):
    query: str = Field(
        description="The search query to look up live information, prices, reviews, or news on the web"
    )
    max_results: int = Field(
        default=3,
        description="Number of search results to return (default: 3)"
    )


class TavilyExtractInput(BaseModel):
    url: str = Field(
        description="A specific website URL to scrape and extract clean readable text from"
    )


# --- 2. TAVILY SEARCH & EXTRACTION TOOLS ---

@tool("tavily_web_search", args_schema=TavilySearchInput)
def tavily_web_search(query: str, max_results: int = 3) -> str:
    """
    Searches the live internet for up-to-date facts, current product prices,
    specs, news, or general real-time web info.
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return (
            "[Tavily Search Notice]: TAVILY_API_KEY is not set in .env. "
            "Please provide a valid Tavily API key to enable live web searches."
        )

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        response = client.search(query=query, max_results=max_results, search_depth="basic")
        results = response.get("results", [])

        if not results:
            return f"No live search results found for query: '{query}'."

        formatted_results = []
        for i, item in enumerate(results, 1):
            title = item.get("title", "Untitled")
            url = item.get("url", "")
            content = item.get("content", "").strip()
            formatted_results.append(f"[{i}] {title}\nSource: {url}\nSummary: {content}")

        return "\n\n---\n\n".join(formatted_results)
    except Exception as e:
        return f"Error executing Tavily web search: {str(e)}"


@tool("tavily_extract_url", args_schema=TavilyExtractInput)
def tavily_extract_url(url: str) -> str:
    """
    Extracts and cleans the full readable text content directly from a specific webpage URL,
    stripping away ads, navigation bars, and cookie popups.
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return "[Tavily Extract Notice]: TAVILY_API_KEY is not set in .env."

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        response = client.extract(urls=[url])
        results = response.get("results", [])

        if not results:
            return f"Could not extract content from URL: {url}"

        raw_content = results[0].get("raw_content", "")
        # Limit to 3500 chars to avoid blowing up LLM context window
        return raw_content[:3500] if raw_content else "No readable text content extracted from page."
    except Exception as e:
        return f"Error extracting page content: {str(e)}"


# Export list of tools for model gateway / router tool binding
ALL_COMMERCE_TOOLS = [tavily_web_search, tavily_extract_url]
