"""
MCP Streamable HTTP client — connects to a @giulio-leone/gaussflow-agent MCP server.

Demonstrates: initialize, list tools, call a tool, close session.
Requires: pip install httpx
"""

import httpx
import json
import sys

BASE_URL = "http://localhost:3000"


def jsonrpc(method: str, params: dict | None = None, req_id: int = 1) -> dict:
    """Build a JSON-RPC 2.0 request body."""
    body: dict = {"jsonrpc": "2.0", "id": req_id, "method": method}
    if params:
        body["params"] = params
    return body


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else BASE_URL

    with httpx.Client(timeout=30) as client:
        # 1. Initialize — establish a session with the MCP server
        resp = client.post(url, json=jsonrpc("initialize"))
        resp.raise_for_status()
        session_id = resp.headers["mcp-session-id"]
        server_info = resp.json()["result"]["serverInfo"]
        print(f"Connected to {server_info['name']} v{server_info['version']}")
        print(f"Session: {session_id}\n")

        headers = {"Mcp-Session-Id": session_id}

        # 2. Send initialized notification (no id → server returns 202)
        client.post(url, json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers=headers)

        # 3. List available tools
        resp = client.post(url, json=jsonrpc("tools/list", req_id=2), headers=headers)
        resp.raise_for_status()
        tools = resp.json()["result"]["tools"]
        print(f"Available tools ({len(tools)}):")
        for t in tools:
            print(f"  - {t['name']}: {t.get('description', '')[:80]}")
        print()

        # 4. Call a tool — example: list the root directory
        resp = client.post(
            url,
            json=jsonrpc("tools/call", {"name": "ls", "arguments": {"path": "."}}, req_id=3),
            headers=headers,
        )
        resp.raise_for_status()
        result = resp.json()["result"]
        if result.get("isError"):
            print(f"Tool error: {result['content'][0]['text']}")
        else:
            print("ls result:")
            print(result["content"][0]["text"])
        print()

        # 5. Close the session
        resp = client.delete(url, headers=headers)
        print(f"Session closed (status {resp.status_code})")


if __name__ == "__main__":
    main()
