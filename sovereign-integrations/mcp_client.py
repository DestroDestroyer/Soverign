import os
import sys
import json
import subprocess

def query_mcp(server_command, args, method="tools/list"):
    """
    A universal wrapper for J.A.R.V.I.S to interact with MCP servers.
    Since J.A.R.V.I.S runs in terminal, this provides a unified JSON-RPC interface over stdio.
    """
    cmd = f"{server_command} {' '.join(args)}"
    print(f"Executing MCP query on: {cmd} with method {method}")
    # In a full implementation, this would communicate via JSON-RPC to the stdio of the server.
    # For now, we stub it to allow J.A.R.V.I.S to extend it.
    print(json.dumps({"status": "ready", "capabilities": ["tools", "resources", "prompts"]}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python mcp_client.py <server_command> [args...]")
        sys.exit(1)
    
    server_cmd = sys.argv[1]
    server_args = sys.argv[2:]
    query_mcp(server_cmd, server_args)
