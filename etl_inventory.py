"""
ETL Pipeline for Unsync and Meter Available Dashboards
Source: MSN With User Report.xlsb
Lookup: smart_meters.parquet (Total Smart Meters Installed)
Output: 
  - data/unsync_cache.parquet
  - data/meter_available_cache.parquet
"""

import os
import sys
import shutil
import time
import pandas as pd
import duckdb

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(WORKSPACE_DIR, "data")
SOURCE_FILE = r"C:\Users\Dharmendra Pal Singh\OneDrive - INTELLI SMART\Desktop\MY Dashboard\MSN With User Report.xlsb"
TEMP_COPY = os.path.join(DATA_DIR, "temp_msn_report.xlsb")
MASTER_PARQUET = os.path.join(DATA_DIR, "smart_meters.parquet")

UNSYNC_PARQUET = os.path.join(DATA_DIR, "unsync_cache.parquet")
METER_AVAIL_PARQUET = os.path.join(DATA_DIR, "meter_available_cache.parquet")

def run_inventory_sync_with_tracker(tracker=None, source_file=None):
    t0 = time.time()
    if source_file is None:
        source_file = SOURCE_FILE
        
    os.makedirs(DATA_DIR, exist_ok=True)
    
    if tracker:
        tracker.log_step("SOURCE_CHECK", f"Verifying source inventory report: {os.path.basename(source_file)}...", 15)
        
    # 1. Check if source exists, if not check for temp or existing
    if not os.path.exists(source_file):
        print(f"[!] Warning: Source file not found at {source_file}")
        if os.path.exists(TEMP_COPY):
            source_file = TEMP_COPY
            print(f"[*] Falling back to cached copy: {TEMP_COPY}")
        else:
            msg = f"No source file available at {source_file}"
            print(f"[!] {msg}")
            if tracker: tracker.fail_sync(msg)
            return False

    # 2. Copy source file safely via PowerShell to avoid file locks if open in Excel
    if source_file != TEMP_COPY:
        try:
            if tracker:
                tracker.log_step("SHADOW_COPY", "Creating safe shadow copy of MSN With User Report.xlsb to prevent Excel file locks...", 30)
            print(f"[*] Copying {os.path.basename(source_file)} to temp copy to avoid Excel locks...")
            import subprocess
            cmd = f'powershell -NoProfile -Command "Copy-Item -LiteralPath \'{source_file}\' -Destination \'{TEMP_COPY}\' -Force"'
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            if os.path.exists(TEMP_COPY) and os.path.getsize(TEMP_COPY) > 1000:
                print(f"[*] Successfully copied to {TEMP_COPY} ({os.path.getsize(TEMP_COPY):,} bytes).")
                read_target = TEMP_COPY
            else:
                print(f"[!] PowerShell copy warning: {res.stderr}")
                read_target = source_file
        except Exception as e:
            print(f"[!] Warning copying file ({e}), reading directly: {source_file}")
            read_target = source_file
    else:
        read_target = source_file

    if tracker:
        tracker.log_step("READ_XLSB", f"Reading Sheet1 from {os.path.basename(read_target)} via pyxlsb...", 45)
    print(f"[*] Reading Sheet1 from {read_target} via pyxlsb...")
    try:
        df = pd.read_excel(read_target, sheet_name="Sheet1", engine="pyxlsb")
    except Exception as read_err:
        msg = f"Failed to read Excel workbook: {str(read_err)}"
        print(f"[!] {msg}")
        if tracker: tracker.fail_sync(msg)
        return False
    print(f"[*] Loaded {len(df):,} raw rows in {time.time()-t0:.2f}s.")

    if tracker:
        tracker.log_step("NORMALIZE", f"Normalizing {len(df):,} records (Phase, Aging Buckets, Status)...", 65)

    # 3. Clean and normalize columns
    for col in df.columns:
        if col not in ['Date_Gap_Num']:
            df[col] = df[col].astype(str).str.strip().replace({'nan': '', 'None': '', 'NaT': ''})

    def norm_phase(p):
        s = str(p).strip().upper()
        if "3" in s: return "3-Phase"
        if "1" in s: return "1-Phase"
        return "1-Phase" if s == "" else s
            
    df['Phase_Norm'] = df['Phase'].apply(norm_phase)

    def get_aging_bucket(g):
        try:
            v = float(g)
            if pd.isna(v) or v < 0: return ">30 days"
            if v <= 7: return "0-7 days"
            elif v <= 15: return "8-15 days"
            elif v <= 30: return "15-30 days"
            else: return ">30 days"
        except Exception:
            return ">30 days"

    df['Date_Gap_Num'] = pd.to_numeric(df['Date_Gap'], errors='coerce').fillna(999).astype(int)
    df['Aging_Bucket'] = df['Date_Gap_Num'].apply(get_aging_bucket)

    # 4. Lookup against Total smart meters installed (smart_meters.parquet) + Daily installations (compiled_installations.parquet)
    if tracker:
        tracker.log_step("RECONCILE_LOOKUP", "Executing vectorized DuckDB lookup against Master (1.13M) & Daily installations...", 80)
    print("[*] Performing DuckDB vectorized lookup against Total Smart Meters Installed & Daily Installations...")
    con = duckdb.connect()
    con.register('raw_df', df)

    p_master = MASTER_PARQUET.replace('\\', '/')
    daily_parquet = os.path.join(DATA_DIR, "compiled_installations.parquet")
    p_daily = daily_parquet.replace('\\', '/')
    
    daily_union_sql = ""
    if os.path.exists(daily_parquet):
        daily_union_sql = f"""
            UNION ALL
            SELECT 
                upper(trim(cast(New_Meter_No as varchar))) as match_key,
                cast(Install_Date as date) as install_date,
                cast(Install_Date as timestamp) as install_timestamp,
                cast(Consumer_ID as varchar) as consumer_number,
                cast(Consumer_Name as varchar) as consumer_name
            FROM read_parquet('{p_daily}')
            WHERE New_Meter_No IS NOT NULL AND trim(cast(New_Meter_No as varchar)) != ''
        """

    lookup_sql = f"""
        CREATE OR REPLACE TABLE enriched_inventory AS
        WITH all_installed AS (
            SELECT 
                upper(trim(cast(new_msn as varchar))) as match_key,
                install_date,
                install_timestamp,
                cast(consumer_number as varchar) as consumer_number,
                cast(consumer_name as varchar) as consumer_name
            FROM read_parquet('{p_master}')
            WHERE new_msn IS NOT NULL AND trim(cast(new_msn as varchar)) != ''
            {daily_union_sql}
        ),
        dedup_installed AS (
            SELECT match_key, install_date, install_timestamp, consumer_number, consumer_name
            FROM all_installed
            QUALIFY row_number() OVER (PARTITION BY match_key ORDER BY install_date DESC NULLS LAST) = 1
        )
        SELECT 
            raw_df.Meter_No AS msn,
            raw_df.Circle AS circle,
            raw_df.HigherOffice AS division,
            raw_df.HigherOffice AS higher_office,
            raw_df.Offices AS office,
            raw_df.Vendor AS vendor,
            raw_df.Vendor AS agency,
            raw_df.Make AS make,
            raw_df.Phase_Norm AS phase,
            raw_df.Communication_Type AS comm_type,
            raw_df."Meter Type" AS meter_type,
            raw_df."Status-Vendor" AS status_vendor,
            raw_df.Status AS orig_status,
            raw_df.Date_Gap_Num AS date_gap,
            raw_df.Aging_Bucket AS aging_bucket,
            raw_df.Ageing AS raw_ageing,
            raw_df."Available In WH" AS available_in_wh,
            raw_df.LoginID AS login_id,
            raw_df.ReceivedDatetime AS received_datetime,
            raw_df.Created_FirstComm AS created_firstcomm,
            raw_df.Latest_LastComm AS latest_lastcomm,
            CASE WHEN p.match_key IS NOT NULL THEN 1 ELSE 0 END AS is_installed,
            p.install_date,
            p.install_timestamp,
            p.consumer_number,
            p.consumer_name,
            -- For Unsync: Closed if installed, else Unsync
            CASE 
                WHEN p.match_key IS NOT NULL THEN 'Closed'
                ELSE 'Unsync'
            END AS unsync_status,
            -- For Meter Available (Not Installed): Installed if installed, else Available
            CASE 
                WHEN p.match_key IS NOT NULL THEN 'Installed'
                ELSE 'Available'
            END AS avail_status
        FROM raw_df
        LEFT JOIN dedup_installed p 
          ON upper(trim(cast(raw_df.Meter_No as varchar))) = p.match_key
    """
    con.execute(lookup_sql)
    
    # 5. Export Unsync cache
    if tracker:
        tracker.log_step("EXPORT_CACHE", "Compiling unsync_cache.parquet and meter_available_cache.parquet...", 92)
    print("[*] Exporting unsync_cache.parquet...")
    u_path = UNSYNC_PARQUET.replace('\\', '/')
    con.execute(f"""
        COPY (
            SELECT * FROM enriched_inventory 
            WHERE orig_status = 'Unsync'
        ) TO '{u_path}' (FORMAT PARQUET, COMPRESSION SNAPPY)
    """)
    unsync_count = con.execute(f"SELECT count(*) FROM read_parquet('{u_path}')").fetchone()[0]
    print(f"[*] unsync_cache.parquet saved with {unsync_count:,} records.")

    # 6. Export Meter Available cache
    print("[*] Exporting meter_available_cache.parquet...")
    m_path = METER_AVAIL_PARQUET.replace('\\', '/')
    con.execute(f"""
        COPY (
            SELECT * FROM enriched_inventory 
            WHERE orig_status = 'Not Installed'
        ) TO '{m_path}' (FORMAT PARQUET, COMPRESSION SNAPPY)
    """)
    avail_count = con.execute(f"SELECT count(*) FROM read_parquet('{m_path}')").fetchone()[0]
    print(f"[*] meter_available_cache.parquet saved with {avail_count:,} records.")

    elapsed = time.time() - t0
    msg = f"Inventory Reconciliation complete in {elapsed:.1f}s! Unsync: {unsync_count:,} records | Available: {avail_count:,} records."
    print(f"[+] {msg}")
    if tracker:
        tracker.complete_sync(msg, unsync_count + avail_count)
    return True

def run_inventory_etl(source_file=None):
    return run_inventory_sync_with_tracker(tracker=None, source_file=source_file)

if __name__ == "__main__":
    run_inventory_etl()
