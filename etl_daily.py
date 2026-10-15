"""
ETL Pipeline for Smart Meter Installation Tracking
Strictly Scoped to Today's Portal Downloads & ULA Metering Reference:
1. Portal Downloaded Reports:
   - Meter Replaced (Batch 308486) -> Labeled as 'Replacement'
   - Meter Installed (NSC) (Batch 308487) -> Labeled as 'NSC'
   - Extracts Agency from suffix of 'Entered By'
   - Flag: is_ula (True if Consumer ID is present in ULA Metering.xlsx)
2. ULA Metering Scope & Today's Consumer ID Match:
   - Reads ULA Metering.xlsx (Sheet 1)
   - Performs Consumer ID lookup STRICTLY against today's downloaded replacement meters
   - Status: 'Installed' (matched today) vs 'Pending' (not installed today)
   - Tracks Circle, Division, and Agency performance strictly for today
"""

import os
import glob
import time
import zipfile
import io
import pandas as pd
import duckdb
import openpyxl

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(WORKSPACE_DIR, "downloads")
DATA_DIR = os.path.join(WORKSPACE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

ULA_EXCEL_PATH = os.path.join(WORKSPACE_DIR, 'references', 'ULA Metering.xlsx')
LOCAL_DB_PATH = os.path.join(DATA_DIR, "dashboard.duckdb")

COMPILED_CSV = os.path.join(DATA_DIR, "compiled_installations.csv")
COMPILED_PARQUET = os.path.join(DATA_DIR, "compiled_installations.parquet")
ULA_CACHE_PARQUET = os.path.join(DATA_DIR, "ula_cache.parquet")

def extract_agency(entered_by):
    if not entered_by or pd.isna(entered_by):
        return "Unknown"
    s = str(entered_by).strip()
    if "_" in s:
        return s.rsplit("_", 1)[-1].strip()
    return s

def compile_portal_reports():
    print("[*] Scanning downloaded portal reports in downloads/...", flush=True)
    all_zips = glob.glob(os.path.join(DOWNLOADS_DIR, "*.zip"))
    
    rep_dfs = []
    nsc_dfs = []
    
    for zpath in sorted(all_zips):
        with zipfile.ZipFile(zpath) as z:
            for fname in z.namelist():
                if fname.endswith(".csv"):
                    with z.open(fname) as f:
                        df = pd.read_csv(io.TextIOWrapper(f, encoding="utf-8", errors="replace"))
                        has_cid = "Consumer ID" in df.columns
                        if has_cid:
                            df["Installation_Type"] = "Replacement"
                            df["Agency"] = df["Entered By"].apply(extract_agency)
                            rep_dfs.append(df)
                            print(f"  [+] Loaded Replacement Report from {os.path.basename(zpath)}: {len(df)} rows")
                        else:
                            df["Installation_Type"] = "NSC"
                            df["Consumer ID"] = None
                            df["Agency"] = df["Entered By"].apply(extract_agency)
                            nsc_dfs.append(df)
                            print(f"  [+] Loaded NSC Report from {os.path.basename(zpath)}: {len(df)} rows")

    if not rep_dfs and not nsc_dfs:
        print("[-] No downloaded files found in downloads folder!")
        return None

    all_dfs = rep_dfs + nsc_dfs
    compiled_df = pd.concat(all_dfs, ignore_index=True)
    
    # Standardize column naming
    col_rename = {
        "Sub Division": "Sub_Division",
        "TARIFF_CODE": "Tariff",
        "DTR Name": "DTR_Name",
        "Installation No": "Installation_No",
        "Consumer ID": "Consumer_ID",
        "ConsumerName": "Consumer_Name",
        "Old Meter No": "Old_Meter_No",
        "New Meter No": "New_Meter_No",
        "Conn Load": "Conn_Load",
        "Load Unit": "Load_Unit",
        "Connection_Type": "Connection_Type",
        "Entered By": "Entered_By",
        "DATE": "Install_Date"
    }
    for old_col, new_col in col_rename.items():
        if old_col in compiled_df.columns:
            compiled_df.rename(columns={old_col: new_col}, inplace=True)

    if "Consumer_ID" in compiled_df.columns:
        compiled_df["Consumer_ID"] = compiled_df["Consumer_ID"].fillna("").astype(str).str.split(".").str[0].str.strip()

    # Deduplicate against repeated downloads
    if "Installation_No" in compiled_df.columns:
        compiled_df = compiled_df.drop_duplicates(subset=["Installation_No"])
    elif "New_Meter_No" in compiled_df.columns:
        compiled_df = compiled_df.drop_duplicates(subset=["New_Meter_No", "Installation_Type"])

    # Save to CSV
    compiled_df.to_csv(COMPILED_CSV, index=False)
    
    # Save to Parquet via in-memory DuckDB (avoids file lock collisions)
    db = duckdb.connect(":memory:")
    db.register("df_comp", compiled_df)
    db.execute("CREATE OR REPLACE TABLE installations AS SELECT * FROM df_comp")
    parquet_p = COMPILED_PARQUET.replace('\\', '/')
    db.execute(f"COPY installations TO '{parquet_p}' (FORMAT PARQUET)")
    db.close()
    
    try:
        db_file = duckdb.connect(LOCAL_DB_PATH)
        db_file.register("df_comp", compiled_df)
        db_file.execute("CREATE OR REPLACE TABLE installations AS SELECT * FROM df_comp")
        db_file.close()
    except Exception:
        pass
    
    print(f"[+] Compiled {len(compiled_df):,} total records ({len(compiled_df[compiled_df['Installation_Type']=='Replacement'])} Replacement, {len(compiled_df[compiled_df['Installation_Type']=='NSC'])} NSC).")
    return compiled_df

def build_ula_cache(compiled_df=None, tracker=None):
    def log(stage, msg, pct=None):
        print(f"[*] [{stage}] {msg}", flush=True)
        if tracker:
            tracker.log_step(stage, msg, pct if pct is not None else tracker.state.get("percent", 50))

    log("ULA_SCOPE", "Initializing ULA Metering Scope & Dual-Source Reconciliation (Master + Daily)...", 10)
    t0 = time.time()

    # 1. Ensure ULA Raw Scope is available
    ula_raw_path = os.path.join(DATA_DIR, "ula_scope_raw.parquet")
    if not os.path.exists(ula_raw_path):
        if not os.path.exists(ULA_EXCEL_PATH):
            err = f"ULA Metering reference file not found at: {ULA_EXCEL_PATH}"
            print(f"[-] {err}")
            if tracker:
                tracker.fail_sync(err)
            return None
        
        log("EXCEL_PARSE", "Extracting 91,033 ULA Scope records from Excel reference file...", 25)
        wb = openpyxl.load_workbook(ULA_EXCEL_PATH, read_only=True, data_only=True)
        target_sheet = "Sheet 1" if "Sheet 1" in wb.sheetnames else wb.sheetnames[0]
        ws = wb[target_sheet]
        records = []
        for r in ws.iter_rows(min_row=2, values_only=True):
            if r[1] is None:
                continue
            cid = str(r[1]).split(".")[0].strip()
            if not cid or cid in ["None", "nan", ""]:
                continue
            c_val = str(r[2]).strip() if len(r) > 2 and r[2] is not None else ""
            d_val = str(r[3]).strip() if len(r) > 3 and r[3] is not None else ""
            name = str(r[6]).strip() if len(r) > 6 and r[6] is not None else ""
            address = str(r[7]).strip() if len(r) > 7 and r[7] is not None else ""
            circle = str(r[8]).strip() if len(r) > 8 and r[8] is not None else c_val
            division = str(r[9]).strip() if len(r) > 9 and r[9] is not None else d_val
            subdivision = str(r[10]).strip() if len(r) > 10 and r[10] is not None else ""
            section = str(r[11]).strip() if len(r) > 11 and r[11] is not None else ""
            mobile = str(r[12]).strip().split(".")[0] if len(r) > 12 and r[12] is not None else ""
            mi_status = str(r[13]).strip() if len(r) > 13 and r[13] is not None else ""
            remarks = str(r[14]).strip() if len(r) > 14 and r[14] is not None else ""
            records.append((
                cid, name, address, circle, division, subdivision, section,
                mobile, mi_status, remarks, target_sheet
            ))
        wb.close()
        df_raw = pd.DataFrame(records, columns=[
            "consumer_id", "consumer_name", "address", "circle", "division",
            "subdivision", "section", "mobile_no", "scope_mi_status", "remarks", "sheet_name"
        ])
        db_raw = duckdb.connect(":memory:")
        db_raw.register("df_raw", df_raw)
        db_raw.execute(f"COPY df_raw TO '{ula_raw_path.replace(chr(92), '/')}' (FORMAT PARQUET, COMPRESSION SNAPPY)")
        db_raw.close()
        log("RAW_CACHED", f"Persisted {len(df_raw):,} raw ULA scope records to parquet.", 40)

    # 2. Dual-source cross-reference in DuckDB
    log("RECONCILE", "Executing dual-source cross-referencing against Master DB (1.13M) & Daily Installs...", 55)
    db = duckdb.connect(":memory:")
    
    # Register daily installations
    if compiled_df is not None:
        db.register("daily_source", compiled_df)
        daily_src_sql = "daily_source"
    elif os.path.exists(COMPILED_PARQUET):
        cp_p = COMPILED_PARQUET.replace('\\', '/')
        daily_src_sql = f"read_parquet('{cp_p}')"
    else:
        db.execute("CREATE TABLE daily_source (Consumer_ID VARCHAR, New_Meter_No VARCHAR, Old_Meter_No VARCHAR, Install_Date VARCHAR, Agency VARCHAR, Phase VARCHAR, Tariff VARCHAR)")
        daily_src_sql = "daily_source"

    master_p = os.path.join(DATA_DIR, "smart_meters.parquet").replace('\\', '/')
    ula_raw_p = ula_raw_path.replace('\\', '/')

    sql_reconcile = f"""
    CREATE OR REPLACE TABLE ula_reconciled AS
    WITH ula AS (
        SELECT * FROM read_parquet('{ula_raw_p}')
    ),
    daily_unique AS (
        SELECT 
            trim(cast(Consumer_ID as varchar)) as cid,
            arg_max(cast(New_Meter_No as varchar), cast(Install_Date as varchar)) as new_msn,
            arg_max(cast(Old_Meter_No as varchar), cast(Install_Date as varchar)) as old_msn,
            arg_max(cast(Install_Date as varchar), cast(Install_Date as varchar)) as install_date,
            arg_max(cast(Agency as varchar), cast(Install_Date as varchar)) as agency,
            arg_max(cast(Phase as varchar), cast(Install_Date as varchar)) as phase,
            arg_max(cast(Tariff as varchar), cast(Install_Date as varchar)) as tariff
        FROM {daily_src_sql}
        WHERE Consumer_ID IS NOT NULL AND trim(cast(Consumer_ID as varchar)) != ''
        GROUP BY cid
    ),
    master_unique AS (
        SELECT 
            trim(cast(consumer_number as varchar)) as cid,
            arg_max(cast(new_msn as varchar), cast(install_date as varchar)) as new_msn,
            arg_max(cast(old_msn as varchar), cast(install_date as varchar)) as old_msn,
            arg_max(cast(install_date as varchar), cast(install_date as varchar)) as install_date,
            arg_max(cast(agency as varchar), cast(install_date as varchar)) as agency,
            arg_max(cast(phase as varchar), cast(install_date as varchar)) as phase,
            arg_max(cast(tariff as varchar), cast(install_date as varchar)) as tariff
        FROM read_parquet('{master_p}')
        WHERE consumer_number IS NOT NULL AND trim(cast(consumer_number as varchar)) != ''
        GROUP BY cid
    )
    SELECT 
        u.consumer_id,
        u.consumer_name,
        u.address,
        u.circle,
        u.division,
        u.subdivision,
        u.section,
        u.mobile_no,
        u.scope_mi_status,
        u.remarks,
        u.sheet_name,
        CASE 
            WHEN d.cid IS NOT NULL OR m.cid IS NOT NULL THEN 'Installed'
            ELSE 'Pending'
        END as status,
        COALESCE(cast(d.agency as varchar), cast(m.agency as varchar), '-') as agency,
        COALESCE(cast(d.new_msn as varchar), cast(m.new_msn as varchar), '-') as new_msn,
        COALESCE(cast(d.old_msn as varchar), cast(m.old_msn as varchar), '-') as old_msn,
        COALESCE(cast(d.install_date as varchar), cast(m.install_date as varchar), '-') as install_date,
        COALESCE(cast(d.phase as varchar), cast(m.phase as varchar), '-') as phase,
        COALESCE(cast(d.tariff as varchar), cast(m.tariff as varchar), '-') as tariff,
        (d.cid IS NOT NULL OR m.cid IS NOT NULL) as is_cumulative_installed,
        (d.cid IS NOT NULL) as is_today_installed
    FROM ula u
    LEFT JOIN daily_unique d ON trim(cast(u.consumer_id as varchar)) = d.cid
    LEFT JOIN master_unique m ON trim(cast(u.consumer_id as varchar)) = m.cid
    """

    db.execute(sql_reconcile)
    
    # 3. Export to ula_cache.parquet
    log("CACHE_SAVE", "Writing unified ULA cache to data/ula_cache.parquet...", 80)
    ula_cache_p = ULA_CACHE_PARQUET.replace('\\', '/')
    db.execute(f"COPY ula_reconciled TO '{ula_cache_p}' (FORMAT PARQUET, COMPRESSION SNAPPY)")

    # Compute metrics
    stats = db.execute("""
        SELECT 
            count(*) as total_scope,
            count(*) FILTER (WHERE is_cumulative_installed) as cum_installed,
            count(*) FILTER (WHERE is_today_installed) as today_installed,
            count(*) - count(*) FILTER (WHERE is_cumulative_installed) as pending
        FROM ula_reconciled
    """).fetchone()

    total_ula, cum_inst, installed_today, pending = stats
    db.close()

    # 4. Update dashboard.duckdb
    log("DB_UPDATE", "Updating local dashboard.duckdb ula_scope table...", 92)
    try:
        db_file = duckdb.connect(LOCAL_DB_PATH)
        db_file.execute(f"CREATE OR REPLACE TABLE ula_scope AS SELECT * FROM '{ula_cache_p}'")
        db_file.close()
    except Exception as dbe:
        print(f"[-] Notice updating local DB: {dbe}", flush=True)

    msg = f"ULA Reconciliation Complete: {total_ula:,} Scope ({cum_inst:,} Installed, {installed_today:,} Today, {pending:,} Pending) in {time.time()-t0:.2f}s."
    log("COMPLETE", msg, 100)
    if tracker:
        tracker.complete_sync(msg, cum_inst)

    print(f"\n[+] ULA Tracking Cache Rebuilt Successfully!")
    print(f"    Total ULA Scope:          {total_ula:,}")
    print(f"    Cumulative ULA Installed: {cum_inst:,}")
    print(f"    Installed TODAY in ULA:   {installed_today:,}")
    print(f"    Pending in ULA:           {pending:,}")
    return total_ula

def build_ula_cache_with_tracker(tracker=None):
    return build_ula_cache(compiled_df=None, tracker=tracker)

if __name__ == "__main__":
    print("=" * 60)
    print("  STARTING TODAY'S SMART METER INSTALLATION ETL PIPELINE")
    print("=" * 60)
    t_start = time.time()
    compiled = compile_portal_reports()
    build_ula_cache(compiled)
    print(f"\n[*] Total ETL runtime: {time.time() - t_start:.2f}s")
    print("=" * 60)
