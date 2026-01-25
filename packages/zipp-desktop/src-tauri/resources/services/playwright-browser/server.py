"""
Playwright Browser Service for Zipp

A FastAPI server that provides headless browser automation via Playwright.
This service allows workflows to control a full Chromium browser with proper
JavaScript execution, unlike the embedded WebView2.

Endpoints:
- /health - Health check
- /session/create - Create a new browser session
- /session/{id}/goto - Navigate to URL
- /session/{id}/click - Click an element
- /session/{id}/type - Type into an element
- /session/{id}/scroll - Scroll the page
- /session/{id}/get_html - Get page HTML
- /session/{id}/get_text - Extract text from element
- /session/{id}/screenshot - Take a screenshot
- /session/{id}/evaluate - Execute JavaScript
- /session/{id}/wait - Wait for selector
- /session/{id}/close - Close the session
"""

import os
import sys
import uuid
import asyncio
import base64
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
# ZIPP_SERVICE_PORT is set by Zipp's dynamic port allocation
PORT = int(os.getenv("ZIPP_SERVICE_PORT", os.getenv("PLAYWRIGHT_PORT", "8769")))
HOST = os.getenv("PLAYWRIGHT_HOST", "127.0.0.1")
HEADLESS = os.getenv("PLAYWRIGHT_HEADLESS", "true").lower() == "true"
DEFAULT_TIMEOUT = int(os.getenv("PLAYWRIGHT_TIMEOUT", "30000"))

# Session storage
sessions: Dict[str, Any] = {}
playwright_instance = None
browser_instance = None


# Request/Response Models
class CreateSessionRequest(BaseModel):
    headless: Optional[bool] = None
    user_agent: Optional[str] = None
    viewport_width: Optional[int] = 1920
    viewport_height: Optional[int] = 1080


class CreateSessionResponse(BaseModel):
    success: bool
    session_id: Optional[str] = None
    message: Optional[str] = None


class GotoRequest(BaseModel):
    url: str
    wait_until: Optional[str] = "domcontentloaded"  # load, domcontentloaded, networkidle
    timeout: Optional[int] = None


class ClickRequest(BaseModel):
    selector: str
    timeout: Optional[int] = None
    force: Optional[bool] = False


class TypeRequest(BaseModel):
    selector: str
    text: str
    delay: Optional[int] = 50  # ms between keystrokes
    timeout: Optional[int] = None


class ScrollRequest(BaseModel):
    x: Optional[int] = 0
    y: Optional[int] = 500
    selector: Optional[str] = None  # Scroll within element


class GetHtmlRequest(BaseModel):
    selector: Optional[str] = None  # None = full page


class GetTextRequest(BaseModel):
    selector: str
    max_length: Optional[int] = None


class ScreenshotRequest(BaseModel):
    selector: Optional[str] = None
    full_page: Optional[bool] = False
    format: Optional[str] = "png"  # png, jpeg


class EvaluateRequest(BaseModel):
    script: str
    args: Optional[list] = None


class WaitRequest(BaseModel):
    selector: str
    state: Optional[str] = "visible"  # attached, detached, visible, hidden
    timeout: Optional[int] = None


class ActionResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    message: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle management."""
    global playwright_instance, browser_instance

    print(f"[Playwright] Starting browser service...")

    try:
        from playwright.async_api import async_playwright

        playwright_instance = await async_playwright().start()

        # Launch browser (shared across sessions for efficiency)
        browser_instance = await playwright_instance.chromium.launch(
            headless=HEADLESS,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ]
        )
        print(f"[Playwright] Browser launched (headless={HEADLESS})")

    except Exception as e:
        print(f"[Playwright] Error launching browser: {e}")
        raise

    yield

    # Cleanup on shutdown
    print("[Playwright] Shutting down...")

    # Close all sessions
    for session_id in list(sessions.keys()):
        try:
            session = sessions[session_id]
            if session.get("context"):
                await session["context"].close()
        except Exception as e:
            print(f"[Playwright] Error closing session {session_id}: {e}")

    sessions.clear()

    if browser_instance:
        await browser_instance.close()

    if playwright_instance:
        await playwright_instance.stop()

    print("[Playwright] Shutdown complete")


app = FastAPI(
    title="Playwright Browser Service",
    description="Headless browser automation for Zipp workflows",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint with service info."""
    return {
        "service": "Playwright Browser",
        "version": "1.0.0",
        "status": "running",
        "sessions": len(sessions),
        "headless": HEADLESS
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "browser": "chromium",
        "headless": HEADLESS,
        "sessions": len(sessions)
    }


@app.post("/session/create", response_model=CreateSessionResponse)
async def create_session(request: CreateSessionRequest = None):
    """Create a new browser session (context + page)."""
    global browser_instance

    if not browser_instance:
        raise HTTPException(status_code=503, detail="Browser not initialized")

    if request is None:
        request = CreateSessionRequest()

    try:
        session_id = str(uuid.uuid4())[:8]

        # Create browser context with optional settings
        context_options = {
            "viewport": {
                "width": request.viewport_width or 1920,
                "height": request.viewport_height or 1080
            }
        }

        if request.user_agent:
            context_options["user_agent"] = request.user_agent

        context = await browser_instance.new_context(**context_options)
        page = await context.new_page()

        sessions[session_id] = {
            "context": context,
            "page": page,
            "created_at": datetime.now().isoformat()
        }

        print(f"[Playwright] Session {session_id} created")

        return CreateSessionResponse(
            success=True,
            session_id=session_id,
            message="Session created successfully"
        )

    except Exception as e:
        print(f"[Playwright] Error creating session: {e}")
        return CreateSessionResponse(
            success=False,
            message=str(e)
        )


def get_session(session_id: str):
    """Get session by ID or raise 404."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return sessions[session_id]


@app.post("/session/{session_id}/goto", response_model=ActionResponse)
async def goto(session_id: str, request: GotoRequest):
    """Navigate to a URL."""
    session = get_session(session_id)
    page = session["page"]

    try:
        timeout = request.timeout or DEFAULT_TIMEOUT
        response = await page.goto(
            request.url,
            wait_until=request.wait_until,
            timeout=timeout
        )

        return ActionResponse(
            success=True,
            result={
                "url": page.url,
                "status": response.status if response else None,
                "title": await page.title()
            }
        )

    except Exception as e:
        print(f"[Playwright] Goto error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/click", response_model=ActionResponse)
async def click(session_id: str, request: ClickRequest):
    """Click an element."""
    session = get_session(session_id)
    page = session["page"]

    try:
        timeout = request.timeout or DEFAULT_TIMEOUT
        await page.click(
            request.selector,
            timeout=timeout,
            force=request.force
        )

        # Small delay to allow page to update
        await asyncio.sleep(0.1)

        return ActionResponse(
            success=True,
            result={
                "clicked": request.selector,
                "url": page.url
            }
        )

    except Exception as e:
        print(f"[Playwright] Click error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/type", response_model=ActionResponse)
async def type_text(session_id: str, request: TypeRequest):
    """Type text into an input element."""
    session = get_session(session_id)
    page = session["page"]

    try:
        timeout = request.timeout or DEFAULT_TIMEOUT

        # Focus and clear existing content
        await page.click(request.selector, timeout=timeout)
        await page.fill(request.selector, "")  # Clear
        await page.type(request.selector, request.text, delay=request.delay)

        return ActionResponse(
            success=True,
            result={
                "typed": request.text,
                "selector": request.selector
            }
        )

    except Exception as e:
        print(f"[Playwright] Type error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/scroll", response_model=ActionResponse)
async def scroll(session_id: str, request: ScrollRequest):
    """Scroll the page or an element."""
    session = get_session(session_id)
    page = session["page"]

    try:
        if request.selector:
            # Scroll within element - use parameter passing to avoid injection
            await page.evaluate(
                """([selector, x, y]) => {
                    const el = document.querySelector(selector);
                    if (el) el.scrollBy(x, y);
                }""",
                [request.selector, request.x, request.y]
            )
        else:
            # Scroll the page
            await page.evaluate(
                """([x, y]) => { window.scrollBy(x, y); }""",
                [request.x, request.y]
            )

        await asyncio.sleep(0.1)  # Allow scroll to complete

        return ActionResponse(
            success=True,
            result={
                "scrolled": {"x": request.x, "y": request.y},
                "selector": request.selector
            }
        )

    except Exception as e:
        print(f"[Playwright] Scroll error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/get_html", response_model=ActionResponse)
async def get_html(session_id: str, request: GetHtmlRequest = None):
    """Get page HTML or element HTML."""
    session = get_session(session_id)
    page = session["page"]

    if request is None:
        request = GetHtmlRequest()

    try:
        if request.selector:
            element = await page.query_selector(request.selector)
            if element:
                html = await element.inner_html()
            else:
                return ActionResponse(
                    success=False,
                    message=f"Element not found: {request.selector}"
                )
        else:
            html = await page.content()

        return ActionResponse(
            success=True,
            result=html
        )

    except Exception as e:
        print(f"[Playwright] Get HTML error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/get_text", response_model=ActionResponse)
async def get_text(session_id: str, request: GetTextRequest):
    """Extract text from an element."""
    session = get_session(session_id)
    page = session["page"]

    try:
        element = await page.query_selector(request.selector)
        if not element:
            return ActionResponse(
                success=False,
                message=f"Element not found: {request.selector}"
            )

        text = await element.inner_text()

        # Apply max_length if specified
        if request.max_length and len(text) > request.max_length:
            text = text[:request.max_length] + "... [truncated]"

        return ActionResponse(
            success=True,
            result=text
        )

    except Exception as e:
        print(f"[Playwright] Get text error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/screenshot", response_model=ActionResponse)
async def screenshot(session_id: str, request: ScreenshotRequest = None):
    """Take a screenshot."""
    session = get_session(session_id)
    page = session["page"]

    if request is None:
        request = ScreenshotRequest()

    try:
        screenshot_options = {
            "type": request.format or "png",
            "full_page": request.full_page or False
        }

        if request.selector:
            element = await page.query_selector(request.selector)
            if not element:
                return ActionResponse(
                    success=False,
                    message=f"Element not found: {request.selector}"
                )
            screenshot_bytes = await element.screenshot(**screenshot_options)
        else:
            screenshot_bytes = await page.screenshot(**screenshot_options)

        # Return as base64
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

        return ActionResponse(
            success=True,
            result={
                "format": request.format or "png",
                "data": screenshot_b64
            }
        )

    except Exception as e:
        print(f"[Playwright] Screenshot error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/evaluate", response_model=ActionResponse)
async def evaluate(session_id: str, request: EvaluateRequest):
    """Execute JavaScript in the page context."""
    session = get_session(session_id)
    page = session["page"]

    try:
        if request.args:
            result = await page.evaluate(request.script, request.args)
        else:
            result = await page.evaluate(request.script)

        return ActionResponse(
            success=True,
            result=result
        )

    except Exception as e:
        print(f"[Playwright] Evaluate error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/wait", response_model=ActionResponse)
async def wait_for_selector(session_id: str, request: WaitRequest):
    """Wait for an element to reach a state."""
    session = get_session(session_id)
    page = session["page"]

    try:
        timeout = request.timeout or DEFAULT_TIMEOUT
        await page.wait_for_selector(
            request.selector,
            state=request.state,
            timeout=timeout
        )

        return ActionResponse(
            success=True,
            result={
                "selector": request.selector,
                "state": request.state
            }
        )

    except Exception as e:
        print(f"[Playwright] Wait error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.post("/session/{session_id}/close", response_model=ActionResponse)
async def close_session(session_id: str):
    """Close a browser session."""
    session = get_session(session_id)

    try:
        if session.get("context"):
            await session["context"].close()

        del sessions[session_id]
        print(f"[Playwright] Session {session_id} closed")

        return ActionResponse(
            success=True,
            result={"closed": session_id}
        )

    except Exception as e:
        print(f"[Playwright] Close error: {e}")
        return ActionResponse(success=False, message=str(e))


@app.get("/sessions")
async def list_sessions():
    """List all active sessions."""
    session_list = []
    for sid, data in sessions.items():
        url = None
        if data.get("page"):
            try:
                url = data["page"].url
            except Exception:
                pass
        session_list.append({
            "id": sid,
            "created_at": data.get("created_at"),
            "url": url
        })
    return {"sessions": session_list}


if __name__ == "__main__":
    import uvicorn

    print(f"[Playwright] Starting server on {HOST}:{PORT}")
    print(f"[Playwright] Headless mode: {HEADLESS}")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info"
    )
