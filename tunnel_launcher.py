"""
Cloudflare Quick Tunnel Manager for Unified Smart Meter Platform (Port 8095)
Launches cloudflared.exe, captures the active trycloudflare.com URL,
persists it to cloudflare_url.txt, and auto-recovers if disconnected.
"""
import os
import sys
import re
import time
import subprocess
import json

# Ensure stdout handles UTF-8 safely
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_CLOUDFLARED = os.path.join(WORKSPACE_DIR, "bin", "cloudflared.exe")
URL_FILE = os.path.join(WORKSPACE_DIR, "cloudflare_url.txt")
JSON_FILE = os.path.join(WORKSPACE_DIR, "data", "cloudflare_url.json")
LOG_FILE = os.path.join(WORKSPACE_DIR, "tunnel.log")
TARGET_URL = "http://127.0.0.1:8095"

def log(msg):
    # Strip any characters that can't be encoded to ascii/console safely
    clean_msg = msg.encode("ascii", errors="replace").decode("ascii")
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {clean_msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass

def start_tunnel():
    if not os.path.exists(BIN_CLOUDFLARED):
        log(f"ERROR: cloudflared.exe not found at {BIN_CLOUDFLARED}")
        return

    cmd = [BIN_CLOUDFLARED, "tunnel", "--url", TARGET_URL, "--no-autoupdate"]
    log(f"Launching Cloudflare Tunnel: {' '.join(cmd)}")

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1
    )

    tunnel_url = None
    for line in iter(proc.stdout.readline, ""):
        line_clean = line.strip()
        if not line_clean:
            continue
        log(f"[cloudflared] {line_clean}")

        m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line_clean)
        if m and not tunnel_url:
            tunnel_url = m.group(0)
            log("==================================================")
            log("LIVE CLOUDFLARE PUBLIC SHAREABLE URL:")
            log(f"URL: {tunnel_url}")
            log("==================================================")
            try:
                with open(URL_FILE, "w", encoding="utf-8") as f:
                    f.write(tunnel_url + "\n")
                os.makedirs(os.path.dirname(JSON_FILE), exist_ok=True)
                with open(JSON_FILE, "w", encoding="utf-8") as f:
                    json.dump({
                        "url": tunnel_url,
                        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "port": 8095,
                        "status": "online"
                    }, f, indent=2)
            except Exception as e:
                log(f"Failed to write URL file: {e}")

    proc.stdout.close()
    proc.wait()
    log(f"cloudflared exited with code {proc.returncode}")

def main():
    log("=== Cloudflare Tunnel Launcher for Port 8095 Started ===")
    while True:
        try:
            start_tunnel()
        except Exception as e:
            log(f"Tunnel runner exception: {e}")
        log("Restarting Cloudflare tunnel in 5 seconds...")
        time.sleep(5)

if __name__ == "__main__":
    main()
