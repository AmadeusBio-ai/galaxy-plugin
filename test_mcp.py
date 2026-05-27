import subprocess
import json
import time

proc = subprocess.Popen(["uvx", "galaxy-mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

init_req = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "1.0"}
    }
}
proc.stdin.write(json.dumps(init_req) + "\n")
proc.stdin.flush()
print("Init:", proc.stdout.readline())

proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
proc.stdin.flush()

tools_req = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
}
proc.stdin.write(json.dumps(tools_req) + "\n")
proc.stdin.flush()
res = proc.stdout.readline()
print("Tools:", res)
proc.terminate()
