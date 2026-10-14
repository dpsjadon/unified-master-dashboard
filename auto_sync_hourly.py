"""
IntelliSmart SBPDCL - Background Hourly Auto-Sync
Runs every hour between 8:00 AM and 8:00 PM.
Downloads latest daily MDM reports, compiles DuckDB analytics,
pushes updated data to Render Cloud Dashboard, and notifies the user via desktop popup.
"""
import os
import sys
import time
from datetime import datetime
import traceback
import json
import subprocess

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(WORKSPACE_DIR, "hourly_sync.log")
NOTIFY_SCRIPT = os.path.join(WORKSPACE_DIR, "notify_toast.ps1")
STATUS_FILE = os.path.join(WORKSPACE_DIR, "data", "sync_status.json")

log_stream = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
if sys.stdout is None or not sys.stdout.isatty():
    sys.stdout = log_stream
if sys.stderr is None or not sys.stderr.isatty():
    sys.stderr = log_stream

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)

def show_popup(title, message, timeout=10):
    """
    Displays a native Windows Toast Notification with sound and
    a visual Desktop Popup Dialog (auto-closes after `timeout` seconds if unattended).
    """
    try:
        if os.path.exists(NOTIFY_SCRIPT):
            subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    NOTIFY_SCRIPT,
                    "-Title",
                    title,
                    "-Message",
                    message,
                    "-TimeoutSeconds",
                    str(timeout),
                ],
                capture_output=True,
                text=True,
                timeout=timeout + 5
            )
            log(f"[Notification] Popup sent: {title} | {message[:60]}...")
    except Exception as e:
        log(f"[-] Could not display notification popup: {e}")

def get_sync_summary():
    """Reads latest message and count from sync_status.json."""
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                msg = data.get("message")
                if msg:
                    return msg
        except Exception:
            pass
    return "Daily Sync Complete! Downloaded & compiled fresh reports."

def main():
    now = datetime.now()
    hour = now.hour

    # Active window: 8:00 AM (08) to 8:00 PM (20)
    if hour < 8 or hour >= 20:
        log(f"Current hour ({hour:02d}:00) is outside active window (08:00 - 20:00). Skipping.")
        return

    log("=== Starting Scheduled Hourly MDM Sync ===")
    sys.path.insert(0, WORKSPACE_DIR)

    try:
        import sync_daily
        success = sync_daily.run_sync()
        ts = datetime.now().strftime("%I:%M %p")
        summary = get_sync_summary()

        if success:
            log("=== Hourly MDM Sync & Cloud Update Completed Successfully! ===")
            show_popup(
                "⚡ IntelliSmart SBPDCL Auto-Sync",
                f"Hourly Auto-Sync Completed at {ts}!\n\n{summary}\n\nLocal & Cloud Dashboards are up to date.",
                timeout=10
            )
        else:
            log("=== Hourly MDM Sync Finished with Notice ===")
            show_popup(
                "⚠️ IntelliSmart SBPDCL Auto-Sync Notice",
                f"Hourly Auto-Sync finished at {ts}.\n\n{summary}",
                timeout=10
            )
    except Exception as e:
        log(f"[-] Hourly sync error: {e}")
        log(traceback.format_exc())
        ts = datetime.now().strftime("%I:%M %p")
        show_popup(
            "❌ IntelliSmart Auto-Sync Error",
            f"Auto-Sync encountered an issue at {ts}:\n\n{str(e)[:250]}",
            timeout=12
        )

if __name__ == "__main__":
    main()
