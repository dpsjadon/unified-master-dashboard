import os
import sys
import time
import json
import threading
import importlib
from datetime import datetime

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(WORKSPACE_DIR, "data", "sync_status.json")

class SyncProgressTracker:
    def __init__(self):
        self.lock = threading.Lock()
        self.state = {
            "running": False,
            "type": None,
            "stage": "IDLE",
            "percent": 0,
            "message": "Ready to synchronize",
            "steps": [],
            "error": None,
            "records_count": 0,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self.load_from_disk()

    def load_from_disk(self):
        if os.path.exists(STATUS_FILE):
            try:
                with open(STATUS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.state.update(data)
                    self.state["running"] = False
            except Exception:
                pass

    def save_to_disk(self):
        try:
            os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
            with open(STATUS_FILE, "w", encoding="utf-8") as f:
                json.dump(self.state, f, indent=2)
        except Exception:
            pass

    def start_sync(self, sync_type, initial_msg):
        with self.lock:
            self.state["running"] = True
            self.state["type"] = sync_type
            self.state["stage"] = "STARTING"
            self.state["percent"] = 5
            self.state["message"] = initial_msg
            self.state["error"] = None
            self.state["steps"] = [{
                "time": time.strftime("%H:%M:%S"),
                "stage": "STARTING",
                "message": initial_msg,
                "percent": 5,
                "status": "ok"
            }]
            self.state["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")
            self.save_to_disk()

    def log_step(self, stage, message, percent, status="ok"):
        with self.lock:
            self.state["stage"] = stage
            self.state["message"] = message
            self.state["percent"] = percent
            self.state["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")
            self.state["steps"].append({
                "time": time.strftime("%H:%M:%S"),
                "stage": stage,
                "message": message,
                "percent": percent,
                "status": status
            })
            self.save_to_disk()
            print(f"[{percent}%] [{stage}] {message}", flush=True)

    def complete_sync(self, message, records_count=0):
        with self.lock:
            self.state["running"] = False
            self.state["stage"] = "COMPLETE"
            self.state["percent"] = 100
            self.state["message"] = message
            self.state["records_count"] = records_count
            self.state["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")
            self.state["steps"].append({
                "time": time.strftime("%H:%M:%S"),
                "stage": "COMPLETE",
                "message": message,
                "percent": 100,
                "status": "success"
            })
            self.save_to_disk()
            print(f"[100%] [COMPLETE] {message}", flush=True)

    def fail_sync(self, error_msg):
        with self.lock:
            self.state["running"] = False
            self.state["stage"] = "ERROR"
            self.state["error"] = error_msg
            self.state["message"] = error_msg
            self.state["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")
            self.state["steps"].append({
                "time": time.strftime("%H:%M:%S"),
                "stage": "ERROR",
                "message": error_msg,
                "percent": self.state["percent"],
                "status": "error"
            })
            self.save_to_disk()
            print(f"[-] [ERROR] {error_msg}", flush=True)

    def get_status(self):
        with self.lock:
            return dict(self.state)

tracker = SyncProgressTracker()

def start_daily_sync():
    if tracker.state.get("running"):
        return False, "A synchronization is already actively in progress."

    tracker.start_sync("daily", "Initiating automated download of fresh Daily Installation Reports from MDM Portal...")

    def worker():
        try:
            sys.path.insert(0, WORKSPACE_DIR)
            import sync_daily
            importlib.reload(sync_daily)
            sync_daily.run_sync_with_tracker(tracker)
        except Exception as e:
            tracker.fail_sync(f"Daily sync encountered an unexpected exception: {str(e)}")

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return True, "Daily MDM report download initiated successfully."

def start_master_sync():
    if tracker.state.get("running"):
        return False, "A synchronization is already actively in progress."

    tracker.start_sync("master", "Initiating automated download of Total Smart Meters Installed (Master DB) from MDM Portal...")

    def worker():
        try:
            sys.path.insert(0, WORKSPACE_DIR)
            import sync_master
            importlib.reload(sync_master)
            sync_master.run_master_sync_with_tracker(tracker)
        except Exception as e:
            tracker.fail_sync(f"Master sync encountered an unexpected exception: {str(e)}")

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return True, "Master DB MDM report download initiated successfully."
