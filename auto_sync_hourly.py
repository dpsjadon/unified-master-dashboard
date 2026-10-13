"""
IntelliSmart SBPDCL - Background Hourly Auto-Sync
Runs completely silently every hour between 8:00 AM and 8:00 PM.
Downloads latest daily MDM reports, compiles DuckDB analytics,
and pushes updated data to Render Cloud Dashboard automatically.
"""
import os
import sys
import time
from datetime import datetime
import traceback

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(WORKSPACE_DIR, "hourly_sync.log")

log_stream = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
if sys.stdout is None or not sys.stdout.isatty():
    sys.stdout = log_stream
if sys.stderr is None or not sys.stderr.isatty():
    sys.stderr = log_stream

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)

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
        if success:
            log("=== Hourly MDM Sync & Cloud Update Completed Successfully! ===")
        else:
            log("=== Hourly MDM Sync Finished with Notice ===")
    except Exception as e:
        log(f"[-] Hourly sync error: {e}")
        log(traceback.format_exc())

if __name__ == "__main__":
    main()
