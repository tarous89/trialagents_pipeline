"""Route Pipeline's two public paths to the shared web process in Frankfurt."""
import httpx
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse


RESOURCE = "/pipeline/chatgpt"
DISCOVERY = "/.well-known/oauth-protected-resource/pipeline/chatgpt"
UPSTREAM = "http://intel-agent-app:10000"
REQUEST_HEADERS = {
    "accept", "authorization", "content-type", "mcp-protocol-version",
    "mcp-method", "mcp-name", "mcp-session-id", "last-event-id", "origin",
}
RESPONSE_HEADERS = {
    "allow", "content-type", "www-authenticate", "mcp-session-id",
    "mcp-protocol-version", "retry-after", "cache-control", "content-encoding",
}


class PipelineIngress:
    def __init__(self, app, *, transport=None):
        self.app = app
        self.client = httpx.AsyncClient(
            base_url=UPSTREAM, transport=transport, trust_env=False,
            timeout=httpx.Timeout(60, connect=5), follow_redirects=False,
        )

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            try:
                await self.app(scope, receive, send)
            finally:
                await self.client.aclose()
            return
        if scope["type"] != "http" or scope["path"] not in {RESOURCE, DISCOVERY}:
            return await self.app(scope, receive, send)
        allowed = ("GET", "HEAD") if scope["path"] == DISCOVERY else ("POST", "GET", "DELETE")
        if scope["method"] not in allowed:
            return await Response(status_code=405, headers={"Allow": ", ".join(allowed)})(scope, receive, send)
        request = Request(scope, receive)
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > 320000:
                return await Response(status_code=413)(scope, receive, send)
            body.extend(chunk)
        headers = {k: v for k, v in request.headers.items() if k in REQUEST_HEADERS}
        headers["accept-encoding"] = "identity"
        outbound = self.client.build_request(request.method, scope["path"], headers=headers, content=bytes(body))
        try:
            upstream = await self.client.send(outbound, stream=True)
        except httpx.RequestError:
            return await Response(status_code=502, headers={"Cache-Control": "no-store"})(scope, receive, send)
        try:
            headers = {k: v for k, v in upstream.headers.items() if k in RESPONSE_HEADERS}
            await StreamingResponse(upstream.aiter_raw(), status_code=upstream.status_code, headers=headers)(scope, receive, send)
        finally:
            await upstream.aclose()
