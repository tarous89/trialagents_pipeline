import sys
import unittest
from pathlib import Path

import httpx
from starlette.responses import PlainTextResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "integration/shared-mcp"))
from pipeline_ingress import CLAUDE_DISCOVERY, CLAUDE_RESOURCE, DISCOVERY, RESOURCE, PipelineIngress


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.upstream_requests = []

        async def web(scope, receive, send):
            from starlette.requests import Request
            request = Request(scope, receive)
            self.upstream_requests.append((request, await request.body()))
            await PlainTextResponse("Connect Pipeline", status_code=401,
                                    headers={"WWW-Authenticate": "Bearer", "Set-Cookie": "ignored=1"})(scope, receive, send)

        gateway = PipelineIngress(PlainTextResponse("existing MCP"), transport=httpx.ASGITransport(app=web))
        self.addAsyncCleanup(gateway.client.aclose)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway), base_url="https://mcp.trialagents.com")
        self.addAsyncCleanup(self.client.aclose)

    async def test_routes_only_pipeline_and_forwards_protocol(self):
        for method, path, content in [("GET", DISCOVERY, b""), ("POST", RESOURCE, b'{"jsonrpc":"2.0"}'),
                                      ("GET", CLAUDE_DISCOVERY, b""), ("POST", CLAUDE_RESOURCE, b'{"jsonrpc":"2.0"}')]:
            response = await self.client.request(method, path, content=content, headers={
                "Authorization": "Bearer fictional", "MCP-Protocol-Version": "2025-11-25", "Cookie": "test=1",
            })
            self.assertEqual((response.status_code, response.text), (401, "Connect Pipeline"))
            self.assertEqual(response.headers["www-authenticate"], "Bearer")
            self.assertNotIn("set-cookie", response.headers)
            req, body = self.upstream_requests[-1]
            self.assertEqual((req.method, req.url.hostname, req.url.path, body), (method, "intel-agent-app", path, content))
            self.assertNotIn("cookie", req.headers)
            self.assertEqual(req.headers["authorization"], "Bearer fictional")
            self.assertEqual(req.headers["mcp-protocol-version"], "2025-11-25")
        for path in ("/mcp", "/research/mcp", "/pipeline/chatgpt/other", "/pipeline-claude/mcp", "/pipeline/claude/other"):
            self.assertEqual((await self.client.get(path)).text, "existing MCP")
        self.assertEqual(len(self.upstream_requests), 4)

    async def test_method_and_size_limits(self):
        self.assertEqual((await self.client.post(DISCOVERY)).status_code, 405)
        self.assertEqual((await self.client.post(CLAUDE_DISCOVERY)).status_code, 405)
        self.assertEqual((await self.client.post(RESOURCE, content=b"a" * 320001)).status_code, 413)
        self.assertFalse(self.upstream_requests)

    async def test_forwards_modern_discovery_and_tool_routing_headers(self):
        for method in ("server/discover", "tools/list", "tools/call"):
            headers = {"Mcp-Protocol-Version": "2026-07-28", "Mcp-Method": method}
            params = {"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"}}
            if method == "tools/call":
                headers["Mcp-Name"] = "read_pipeline"
                params.update(name="read_pipeline", arguments={})
            await self.client.post(RESOURCE, headers=headers, json={
                "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
            })
            request, _ = self.upstream_requests[-1]
            for key, value in headers.items():
                self.assertEqual(request.headers.get(key), value)
