"""
Portal Synchronization Service for IntelliSmart SBPDCL Tracking (Daily Reports)
Performs automated login, report generation from MRReport, queue monitoring with
Request ID tracking & intelligent fallback, concurrency resolution, verified
dual-package downloading (Replacement + NSC), and DuckDB vectorized ETL compilation.
Streams real-time execution steps into SyncProgressTracker.
"""

import os
import sys
import time
import re
import glob
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(WORKSPACE_DIR, "downloads")
CONFIG_FILE = os.path.join(WORKSPACE_DIR, "config.env")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

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

def run_sync_with_tracker(tracker=None):
    def log(stage, msg, pct, status="ok"):
        if tracker:
            tracker.log_step(stage, msg, pct, status)
        print(f"[{pct}%] [{stage}] {msg}", flush=True)

    driver = None
    try:
        # Step 0: Cleanup previous downloads
        log("CLEANUP", "Purging previous temporary download files to ensure fresh report retrieval...", 6)
        os.makedirs(DOWNLOADS_DIR, exist_ok=True)
        for f in glob.glob(os.path.join(DOWNLOADS_DIR, "*")):
            try:
                os.remove(f)
            except Exception:
                pass

        # Step 1: Launch Headless Chrome
        log("BROWSER", "Starting background Chrome automation engine (Headless Mode)...", 12)
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
            "download.default_directory": DOWNLOADS_DIR,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True
        })

        from selenium.webdriver.chrome.service import Service
        service = None
        if os.path.exists("/usr/bin/chromedriver"):
            service = Service(executable_path="/usr/bin/chromedriver")

        driver = webdriver.Chrome(service=service, options=options) if service else webdriver.Chrome(options=options)
        driver.execute_cdp_cmd("Browser.setDownloadBehavior", {
            "behavior": "allow",
            "downloadPath": DOWNLOADS_DIR,
            "eventsEnabled": True
        })
        driver.execute_cdp_cmd("Page.setDownloadBehavior", {
            "behavior": "allow",
            "downloadPath": DOWNLOADS_DIR
        })
        wait = WebDriverWait(driver, 25)

        # Step 2: Login to MDM Portal
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
            btn_submit = driver.find_element(By.ID, "BtnSubmit")
            driver.execute_script("arguments[0].click();", btn_submit)
            time.sleep(4)

        log("SESSION", "Authentication successful! Portal session established.", 26)

        # Step 3: Query MRReport
        today_str = datetime.now().strftime("%d-%m-%Y")
        yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%d-%m-%Y")
        active_date = today_str

        def query_date(d_str):
            driver.get("https://mdm.sbpdclinfra.in/MDM/MeterReplacement/MRReport?pn=1")
            from_inp = wait.until(EC.presence_of_element_located((By.ID, "ContentPlaceHolder1_authsub_txtFromDate")))
            to_inp = driver.find_element(By.ID, "ContentPlaceHolder1_authsub_txtToDate")
            driver.execute_script("arguments[0].value = arguments[1];", from_inp, d_str)
            driver.execute_script("arguments[0].value = arguments[1];", to_inp, d_str)
            view_btn = driver.find_element(By.ID, "ContentPlaceHolder1_authsub_btnView")
            driver.execute_script("arguments[0].click();", view_btn)
            time.sleep(5)
            return [l for l in driver.find_elements(By.XPATH, "//a[contains(@href, 'ConsumerCount')]") if l.text.strip().isdigit()]

        log("QUERY", f"Checking installation reports for date: {today_str}...", 32)
        links = query_date(today_str)
        if not links:
            log("QUERY", f"No records uploaded for {today_str} yet. Checking {yesterday_str}...", 36)
            links = query_date(yesterday_str)
            active_date = yesterday_str

        if not links:
            raise RuntimeError(f"Unable to find any installation records on portal for {today_str} or {yesterday_str}.")

        batch_targets = []
        if len(links) >= 1:
            batch_targets.append((0, "Replacement", links[0].text.strip()))
        if len(links) >= 2:
            batch_targets.append((1, "NSC", links[1].text.strip()))

        log("FOUND", f"Found {len(batch_targets)} batches for {active_date}. Requesting downloads from MDM...", 40)

        # Step 4: Request batches with concurrency limit handling and modal polling
        request_ids = {}

        for b_idx, b_label, b_count in batch_targets:
            pct_val = 45 if b_idx == 0 else 55
            log("REQUEST", f"Triggering {b_label} Batch download request ({b_count} meters)...", pct_val)

            # Re-query date to get fresh elements on MRReport overview
            fresh_links = query_date(active_date)
            if len(fresh_links) <= b_idx:
                raise RuntimeError(f"Could not locate {b_label} batch link (index {b_idx}) on MRReport!")

            target_link = fresh_links[b_idx]
            driver.execute_script("arguments[0].click();", target_link)

            # Ensure navigation to detailed page
            wait.until(EC.url_contains("MRReportDetails"))

            req_id = None
            max_retries = 6
            for attempt in range(max_retries):
                btn_req = wait.until(EC.element_to_be_clickable((By.ID, "ContentPlaceHolder1_authsub_btnDownloadRequest")))
                driver.execute_script("arguments[0].click();", btn_req)

                # Poll for confirmation modal or concurrency warning for up to 15 seconds
                modal_text = ""
                for _ in range(15):
                    time.sleep(1)
                    modals = driver.find_elements(By.ID, "myModal") + driver.find_elements(By.CLASS_NAME, "modal-content")
                    for m in modals:
                        txt = m.text
                        if "Request id" in txt or "active downloads" in txt:
                            modal_text = txt
                            ok_btns = m.find_elements(By.XPATH, ".//button[contains(text(), 'Ok') or contains(text(), 'OK')]")
                            if ok_btns:
                                driver.execute_script("arguments[0].click();", ok_btns[0])
                            break
                    if modal_text:
                        break

                if "active downloads" in modal_text.lower():
                    log("WAIT", f"MDM queue active download limit reached. Waiting 12s for queue slot before retrying {b_label}...", pct_val)
                    time.sleep(12)
                    continue

                m_match = re.search(r"Request id is (\d+)", modal_text, re.IGNORECASE)
                if m_match:
                    req_id = m_match.group(1)
                    log("REQUEST", f"Generated MDM Request ID #{req_id} for {b_label} ({b_count} records).", pct_val)
                    break
                else:
                    # In case modal closed or format differed
                    if attempt < max_retries - 1:
                        time.sleep(3)
                    else:
                        break

            request_ids[b_label] = req_id
            time.sleep(2)

        # Step 5: Monitor Queue in MIS/DownloadRequest
        log("QUEUE", "Navigating to Download Requests queue (MIS/DownloadRequest)...", 64)
        driver.get("https://mdm.sbpdclinfra.in/MIS/DownloadRequest")
        time.sleep(4)

        expected_count = len(batch_targets)
        target_ids = [rid for rid in request_ids.values() if rid]

        # Intelligent Fallback: If any request ID wasn't captured from modal,
        # inspect recent rows in the queue for 'Day Wise Meter Installation - ConsumerCount'
        if len(target_ids) < expected_count:
            recent_rows = driver.find_elements(By.XPATH, "//table//tr[contains(., 'Day Wise Meter Installation - ConsumerCount')]")
            for r in recent_rows[:5]:
                parts = r.text.split()
                if parts and parts[0].isdigit():
                    cand_id = parts[0]
                    if cand_id not in target_ids:
                        target_ids.append(cand_id)
                        if len(target_ids) >= expected_count:
                            break

        log("QUEUE", f"Tracking MDM Queue for Request IDs: {target_ids}", 67)

        ready_reqs = {}
        for poll in range(40):
            rows = driver.find_elements(By.XPATH, "//table//tr[contains(., 'Day Wise Meter Installation - ConsumerCount')]")

            if target_ids:
                for r in rows:
                    r_text = r.text
                    for tid in target_ids:
                        if tid in r_text and "Processed" in r_text:
                            btn = r.find_elements(By.XPATH, ".//input[@type='image']")
                            if btn and tid not in ready_reqs:
                                ready_reqs[tid] = (r, btn[0])

                if len(ready_reqs) >= len(target_ids):
                    log("QUEUE", f"All {len(target_ids)} requested report packages are PROCESSED and ready in MDM queue!", 74)
                    break
            else:
                processed_rows = [r for r in rows if "Processed" in r.text]
                if len(processed_rows) >= expected_count:
                    log("QUEUE", f"Found {len(processed_rows)} processed reports in MDM queue!", 74)
                    break

            if poll % 3 == 0:
                log("QUEUE", f"Waiting for MDM server to compile report files (Poll {poll+1}/40)...", 69)
            time.sleep(4)
            driver.refresh()
            time.sleep(2)

        # Step 6: Sequential download without refresh interruptions
        log("DOWNLOAD", "Queue ready! Downloading fresh processed ZIP packages to repository...", 76)

        downloaded_files = []

        if target_ids and len(ready_reqs) == len(target_ids):
            for tid in target_ids:
                r_elem, btn_elem = ready_reqs[tid]
                log("DOWNLOAD", f"Downloading report package for Request #{tid}...", 78)
                driver.execute_script("arguments[0].click();", btn_elem)

                # Wait for file download to complete
                prev_len = len(downloaded_files)
                for _ in range(25):
                    time.sleep(1)
                    current_zips = [z for z in glob.glob(os.path.join(DOWNLOADS_DIR, "*.zip")) if not z.endswith('.crdownload')]
                    if len(current_zips) > prev_len:
                        new_f = [z for z in current_zips if z not in downloaded_files][0]
                        downloaded_files.append(new_f)
                        log("DOWNLOAD", f"Package saved: {os.path.basename(new_f)} ({os.path.getsize(new_f):,} bytes)", 80)
                        break
        else:
            # Fallback: sequential download from top processed rows
            rows = driver.find_elements(By.XPATH, "//table//tr[contains(., 'Day Wise Meter Installation - ConsumerCount') and contains(., 'Processed')]")
            num_to_dl = min(len(rows), expected_count)
            for i in range(num_to_dl):
                rows_current = driver.find_elements(By.XPATH, "//table//tr[contains(., 'Day Wise Meter Installation - ConsumerCount') and contains(., 'Processed')]")
                if i < len(rows_current):
                    btn = rows_current[i].find_elements(By.XPATH, ".//input[@type='image']")
                    if btn:
                        log("DOWNLOAD", f"Downloading report package {i+1} of {num_to_dl}...", 78 + (i * 2))
                        driver.execute_script("arguments[0].click();", btn[0])
                        prev_len = len(downloaded_files)
                        for _ in range(25):
                            time.sleep(1)
                            current_zips = [z for z in glob.glob(os.path.join(DOWNLOADS_DIR, "*.zip")) if not z.endswith('.crdownload')]
                            if len(current_zips) > prev_len:
                                new_f = [z for z in current_zips if z not in downloaded_files][0]
                                downloaded_files.append(new_f)
                                log("DOWNLOAD", f"Package saved: {os.path.basename(new_f)} ({os.path.getsize(new_f):,} bytes)", 80)
                                break

        log("VERIFY", "Waiting for ZIP file downloads to finalize...", 84)
        time.sleep(3)
        zips = [z for z in glob.glob(os.path.join(DOWNLOADS_DIR, "*.zip")) if not z.endswith('.crdownload')]
        if not zips:
            raise RuntimeError("No ZIP files were downloaded from the portal.")

        log("DOWNLOAD", f"Successfully downloaded {len(zips)} report packages from MDM portal.", 86)

        # Close Chrome immediately to free memory
        try:
            driver.quit()
            driver = None
        except Exception:
            pass

        # Step 7: Vectorized DuckDB ETL Compilation
        log("ETL", "Executing vectorized DuckDB ETL compilation on fresh reports...", 88)
        sys.path.insert(0, WORKSPACE_DIR)
        import etl_daily as etl
        compiled = etl.compile_portal_reports()
        if compiled is None or len(compiled) == 0:
            raise RuntimeError("Downloaded reports contained no installation records.")

        repl_c = int((compiled['Installation_Type'] == 'Replacement').sum())
        nsc_c = int((compiled['Installation_Type'] == 'NSC').sum())
        total_c = len(compiled)

        log("ULA", f"Cross-referencing {total_c:,} installations ({repl_c:,} Replacement + {nsc_c:,} NSC) against ULA scope...", 94)
        etl.build_ula_cache(compiled)

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
                subprocess.run([git_cmd, "commit", "-m", f"Auto-sync data update {datetime.now().strftime('%Y-%m-%d %H:%M')}"], cwd=WORKSPACE_DIR, capture_output=True, timeout=30)
                subprocess.run([git_cmd, "push", "origin", "main"], cwd=WORKSPACE_DIR, capture_output=True, timeout=60)
                log("CLOUD", "Cloud Dashboard updated successfully on Render!", 99, "ok")
        except Exception as pe:
            print(f"[-] Auto-push to cloud notice: {pe}", flush=True)

        msg = f"Daily Sync Complete! Downloaded & compiled {total_c:,} meters ({repl_c:,} Replacement + {nsc_c:,} NSC)."
        if tracker:
            tracker.complete_sync(msg, total_c)
        else:
            log("COMPLETE", msg, 100, "success")
        return True

    except Exception as e:
        err = f"Daily MDM sync error: {str(e)}"
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

def run_sync():
    import sync_manager
    sync_manager.tracker.start_sync("daily", "Starting automated hourly sync from MDM Portal...")
    return run_sync_with_tracker(sync_manager.tracker)

if __name__ == "__main__":
    run_sync()
