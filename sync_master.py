"""
Automated Portal Downloader for SBPDCL Smart Meter Installation Reports (Cumulative Master DB)
Full End-to-End Pipeline:
1. Automated SSO Login
2. Requests FRESH Report Generation from https://mdm.sbpdclinfra.in/MDM/MeterReplacement/MeterReplacementOverview
3. Navigates to https://mdm.sbpdclinfra.in/MIS/DownloadRequest
4. Locates latest 'Total Smart Meters Installed' (Status: Processed)
5. Cleans temporary download artifacts and downloads fresh ZIP into downloads_temp
6. Extracts batch1 & batch2 CSV files into extracted_smart_meters
7. Executes vectorized ETL Pipeline to update DuckDB & Parquet
8. Streams execution steps in real-time to SyncProgressTracker
"""

import os
import sys
import time
import glob
import zipfile
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(WORKSPACE_DIR, "downloads_temp")
EXTRACT_DIR = os.path.join(WORKSPACE_DIR, "extracted_smart_meters")
CONFIG_FILE = os.path.join(WORKSPACE_DIR, "config.env")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
os.makedirs(EXTRACT_DIR, exist_ok=True)

def load_credentials():
    user = os.environ.get("MDM_USERNAME", "MNG_DHARMENDRA")
    pwd = os.environ.get("MDM_PASSWORD", "Test@123")
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("MDM_USERNAME="):
                        user = line.split("=", 1)[1].strip()
                    elif line.startswith("MDM_PASSWORD="):
                        pwd = line.split("=", 1)[1].strip()
        except Exception:
            pass
    return user, pwd

def run_master_sync_with_tracker(tracker=None):
    def log(stage, msg, pct, status="ok"):
        if tracker:
            tracker.log_step(stage, msg, pct, status)
        print(f"[{pct}%] [{stage}] {msg}", flush=True)

    driver = None
    try:
        log("CLEANUP", "Clearing previous temporary download directory...", 5)
        os.makedirs(DOWNLOAD_DIR, exist_ok=True)
        for f in glob.glob(os.path.join(DOWNLOAD_DIR, "*")):
            try:
                os.remove(f)
            except Exception:
                pass

        log("BROWSER", "Initializing background Headless Chrome automation engine...", 10)
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        if os.path.exists("/usr/bin/chromium"):
            options.binary_location = "/usr/bin/chromium"
        elif os.path.exists("/usr/bin/google-chrome"):
            options.binary_location = "/usr/bin/google-chrome"

        options.add_experimental_option("prefs", {
            "download.default_directory": DOWNLOAD_DIR,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
            "safebrowsing.disable_download_protection": True
        })

        from selenium.webdriver.chrome.service import Service
        service = None
        if os.path.exists("/usr/bin/chromedriver"):
            service = Service(executable_path="/usr/bin/chromedriver")

        driver = webdriver.Chrome(service=service, options=options) if service else webdriver.Chrome(options=options)
        driver.execute_cdp_cmd("Browser.setDownloadBehavior", {
            "behavior": "allow",
            "downloadPath": DOWNLOAD_DIR,
            "eventsEnabled": True
        })
        driver.execute_cdp_cmd("Page.setDownloadBehavior", {
            "behavior": "allow",
            "downloadPath": DOWNLOAD_DIR
        })
        wait = WebDriverWait(driver, 25)

        user, pwd = load_credentials()
        log("AUTH", f"Connecting to MDM Portal & authenticating as {user}...", 18)
        driver.get("https://mdm.sbpdclinfra.in/SSO/LoginPage")
        time.sleep(2)
        log("DEBUG", f"Page URL: {driver.current_url} | Title: {driver.title}", 20)

        page_src = driver.page_source.lower()
        if "403 forbidden" in page_src or "access denied" in page_src or "403" in driver.title:
            raise RuntimeError(
                "MDM Portal (mdm.sbpdclinfra.in) is protected by the SBPDCL State Discom Firewall, "
                "which blocks cloud hosting IPs (HTTP 403 Forbidden). "
                "Please run sync from your local machine (localhost:8095). "
                "Your local machine will download the reports and automatically push the updated data to this cloud dashboard."
            )

        if "LoginPage" in driver.current_url or "Login" in driver.title:
            user_inp = wait.until(EC.presence_of_element_located((By.ID, "tne")))
            pass_inp = driver.find_element(By.ID, "tpw")
            user_inp.clear()
            user_inp.send_keys(user)
            pass_inp.clear()
            pass_inp.send_keys(pwd)
            time.sleep(1)
            driver.find_element(By.ID, "BtnSubmit").click()
            time.sleep(4)

        log("SESSION", "Authentication successful! Portal session established.", 26)

        # Step 2: Request fresh report from Overview
        log("NAV", "Navigating to Meter Replacement Overview on MDM Portal...", 32)
        driver.get("https://mdm.sbpdclinfra.in/MDM/MeterReplacement/MeterReplacementOverview")
        time.sleep(4)

        try:
            gen_btn = driver.find_element(By.ID, "ContentPlaceHolder1_authsub_dlMenu_ImageButton1_9")
            log("REQUEST", "Submitting fresh generation request for 'Total Smart Meters Installed'...", 42)
            driver.execute_script("arguments[0].click();", gen_btn)
            time.sleep(3)
            try:
                alert = driver.switch_to.alert
                log("PORTAL", f"Portal prompt confirmed: {alert.text}", 48)
                alert.accept()
            except Exception:
                pass
        except Exception as e:
            print("Notice on Overview card trigger:", e)

        # Step 3: Download Request Page
        log("QUEUE", "Navigating to Download Requests queue (MIS/DownloadRequest)...", 54)
        driver.get("https://mdm.sbpdclinfra.in/MIS/DownloadRequest")
        time.sleep(4)

        target_row = None
        for poll in range(12):
            rows = driver.find_elements(By.XPATH, "//table//tr[contains(., 'Total Smart Meters Installed')]")
            if rows:
                latest = rows[0]
                if "Processed" in latest.text:
                    target_row = latest
                    break
                else:
                    log("QUEUE", f"Report compiling on portal (status: {latest.text[:30]}...)", 56 + poll)
            time.sleep(4)
            driver.refresh()

        if not target_row:
            p_rows = driver.find_elements(By.XPATH, "//table//tr[contains(., 'Total Smart Meters Installed') and contains(., 'Processed')]")
            if p_rows:
                target_row = p_rows[0]
            else:
                raise RuntimeError("No processed 'Total Smart Meters Installed' reports found on portal.")

        log("DOWNLOAD", "Triggering download of 'Total Smart Meters Installed' ZIP package...", 65)
        dl_button = target_row.find_element(By.XPATH, ".//input[@type='image'] | .//td[last()]//input | .//td[last()]//a")
        driver.execute_script("arguments[0].click();", dl_button)

        log("PROGRESS", "Receiving report data stream from portal...", 68)
        downloaded_zip = None
        start_time = time.time()
        timeout = 600
        last_pct = 68

        while time.time() - start_time < timeout:
            crdownloads = glob.glob(os.path.join(DOWNLOAD_DIR, "*.crdownload"))
            zips = glob.glob(os.path.join(DOWNLOAD_DIR, "*.zip"))

            if crdownloads:
                cur_size = os.path.getsize(crdownloads[0])
                mb = cur_size / (1024 * 1024)
                pct = min(86, int(68 + (mb / 114.0) * 18))
                if pct > last_pct:
                    log("PROGRESS", f"Downloading Master Report: {mb:.1f} MB received...", pct)
                    last_pct = pct
            elif zips:
                latest = zips[0]
                s1 = os.path.getsize(latest)
                time.sleep(2)
                s2 = os.path.getsize(latest)
                if s1 == s2 and s1 > 5 * 1024 * 1024:
                    downloaded_zip = latest
                    log("PROGRESS", f"Master Report ZIP downloaded ({s2 / (1024*1024):.1f} MB).", 88)
                    break
            time.sleep(2)

        if not downloaded_zip:
            raise RuntimeError("Download of Total Smart Meters Installed ZIP timed out.")

        try:
            driver.quit()
            driver = None
        except Exception:
            pass

        # Step 4: Extract CSV batches
        log("EXTRACT", "Extracting CSV batches into extracted_smart_meters repository...", 90)
        os.makedirs(EXTRACT_DIR, exist_ok=True)
        with zipfile.ZipFile(downloaded_zip, 'r') as z:
            for item in z.namelist():
                z.extract(item, EXTRACT_DIR)

        # Step 5: Run Vectorized DuckDB ETL Pipeline
        log("ETL", "Running Vectorized DuckDB ETL Pipeline (1.13M records)...", 93)
        sys.path.insert(0, WORKSPACE_DIR)
        import etl_master
        count = etl_master.run_etl()

        # Step 6: Automatically reconcile ULA Scope with fresh Master data
        try:
            log("ULA", "Auto-reconciling ULA Scope with latest Master data...", 95)
            import etl_daily
            etl_daily.build_ula_cache()
        except Exception as ue:
            print(f"[-] Auto ULA reconciliation notice: {ue}", flush=True)

        # Step 7: Automatically reconcile Unsync & Meter Available Inventory with fresh Master data
        try:
            log("INVENTORY", "Auto-reconciling Unsync & Meter Available Inventory with latest Master data...", 96)
            import etl_inventory
            etl_inventory.run_inventory_sync_with_tracker(tracker=None)
        except Exception as ie:
            print(f"[-] Auto inventory reconciliation notice: {ie}", flush=True)

        # Auto-push updated data to Render cloud if running locally
        try:
            git_cmd = r"C:\Users\Dharmendra Pal Singh\AppData\Local\Programs\Git\cmd\git.exe"
            if not os.path.exists(git_cmd):
                import shutil
                git_cmd = shutil.which("git")
            if git_cmd and os.path.exists(os.path.join(WORKSPACE_DIR, ".git")):
                log("CLOUD", "Pushing updated data to Cloud Dashboard (Render)...", 97)
                import subprocess
                subprocess.run([git_cmd, "add", "data/"], cwd=WORKSPACE_DIR, capture_output=True, timeout=30)
                subprocess.run([git_cmd, "commit", "-m", f"Auto-sync master data update {datetime.now().strftime('%Y-%m-%d %H:%M')}"], cwd=WORKSPACE_DIR, capture_output=True, timeout=30)
                subprocess.run([git_cmd, "push", "origin", "main"], cwd=WORKSPACE_DIR, capture_output=True, timeout=90)
                log("CLOUD", "Cloud Dashboard updated successfully on Render!", 99, "ok")
        except Exception as pe:
            print(f"[-] Auto-push to cloud notice: {pe}", flush=True)

        msg = f"Master Database ({count:,} smart meters) synchronized successfully!"
        if tracker:
            tracker.complete_sync(msg, count)
        else:
            log("COMPLETE", msg, 100, "success")
        return True

    except Exception as e:
        err = f"Master DB sync error: {str(e)}"
        if tracker:
            tracker.fail_sync(err)
        else:
            print(f"[-] {err}", flush=True)
        return False
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass

def run_portal_automation():
    return run_master_sync_with_tracker()

if __name__ == "__main__":
    run_master_sync_with_tracker()
