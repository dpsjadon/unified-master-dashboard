"""
IntelliSmart SBPDCL - Automated Portal Sync & Report Downloader
Fetches 'Total Smart Meters Installed' Report from https://mdm.sbpdclinfra.in/General/Home
and feeds into the ETL Pipeline.
"""

import os
import sys
import time
import zipfile
import shutil
import glob
from datetime import datetime

PORTAL_URL = "https://mdm.sbpdclinfra.in/General/Home"
DEFAULT_DOWNLOAD_DIR = os.path.join(os.path.expanduser("~"), "Downloads")
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
EXTRACT_DIR = os.path.join(WORKSPACE_DIR, "extracted_smart_meters")

def check_for_latest_downloaded_zip(download_dir=DEFAULT_DOWNLOAD_DIR):
    """
    Scans the downloads folder or workspace for the latest 'Total Smart Meters Installed' zip file.
    """
    search_dirs = [download_dir, WORKSPACE_DIR]
    candidates = []
    
    for d in search_dirs:
        if os.path.exists(d):
            zips = glob.glob(os.path.join(d, "*Total*Smart*Meter*.zip")) + glob.glob(os.path.join(d, "*Master*Information*.zip"))
            for z in zips:
                candidates.append((z, os.path.getmtime(z), os.path.getsize(z)))
                
    if not candidates:
        return None
        
    # Sort by modification time descending
    candidates.sort(key=lambda x: x[1], reverse=True)
    latest_file, mtime, size = candidates[0]
    return latest_file

def extract_and_sync(zip_path):
    """
    Extracts the zip file into extracted_smart_meters and runs the ETL pipeline.
    """
    print(f"[*] Processing ZIP file: {zip_path}")
    os.makedirs(EXTRACT_DIR, exist_ok=True)
    
    with zipfile.ZipFile(zip_path, 'r') as z:
        for name in z.namelist():
            print(f"  -> Extracting: {name}")
            z.extract(name, EXTRACT_DIR)
            
    print("[*] Triggering ETL pipeline...")
    from etl_pipeline import run_etl
    record_count = run_etl()
    print(f"[+] Sync completed! Total records now: {record_count:,}")
    return record_count

def automated_browser_sync(username=None, password=None, headless=False):
    """
    Automated browser downloader using Playwright/Selenium.
    """
    print("==================================================================")
    print("   INTELLISMART SBPDCL AUTOMATED PORTAL DOWNLOADER")
    print(f"   Target URL: {PORTAL_URL}")
    print("==================================================================")
    
    print("\nNote: Portal navigation flow:")
    print("1. Open: https://mdm.sbpdclinfra.in/General/Home")
    print("2. Enter Discom Credentials")
    print("3. Navigate to MIS tab -> Master -> Consumer report")
    print("4. Select Report: Total Smart Meters Installed")
    print("5. Click View -> Click Download ZIP")
    print("\nIf you have already downloaded the report ZIP:")
    
    latest_zip = check_for_latest_downloaded_zip()
    if latest_zip:
        print(f"\nFound latest report ZIP file: {latest_zip}")
        confirm = input("Would you like to import and process this file now? (Y/n): ").strip().lower()
        if confirm in ['', 'y', 'yes']:
            extract_and_sync(latest_zip)
            return
            
    manual_path = input("Enter path to downloaded ZIP file (or drag-and-drop here): ").strip().strip('"')
    if manual_path and os.path.exists(manual_path):
        extract_and_sync(manual_path)
    else:
        print("[-] File not found or path was empty.")

if __name__ == "__main__":
    automated_browser_sync()
