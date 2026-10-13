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
    
    # Save to DuckDB and Parquet
    db = duckdb.connect(LOCAL_DB_PATH)
    db.register("df_comp", compiled_df)
    db.execute("CREATE OR REPLACE TABLE installations AS SELECT * FROM df_comp")
    
    parquet_p = COMPILED_PARQUET.replace('\\', '/')
    db.execute(f"COPY installations TO '{parquet_p}' (FORMAT PARQUET)")
    db.close()
    
    print(f"[+] Compiled {len(compiled_df):,} total records ({len(compiled_df[compiled_df['Installation_Type']=='Replacement'])} Replacement, {len(compiled_df[compiled_df['Installation_Type']=='NSC'])} NSC).")
    return compiled_df

def build_ula_cache(compiled_df=None):
    print("\n[*] Processing ULA Metering Scope & Today's Consumer ID Match...", flush=True)
    if not os.path.exists(ULA_EXCEL_PATH):
        print(f"[-] ULA Metering file not found at: {ULA_EXCEL_PATH}")
        return None

    if compiled_df is None:
        db = duckdb.connect(LOCAL_DB_PATH)
        compiled_df = db.execute("SELECT * FROM installations").df()
        db.close()

    # Extract today's replacement meters dictionary strictly from today's download
    today_installed = {}
    if compiled_df is not None:
        rep_rows = compiled_df[compiled_df["Installation_Type"] == "Replacement"]
        for _, r in rep_rows.iterrows():
            cid = str(r.get("Consumer_ID", "")).strip()
            if cid and cid not in ["None", "nan", ""]:
                today_installed[cid] = {
                    "new_msn": str(r.get("New_Meter_No", "-")),
                    "old_msn": str(r.get("Old_Meter_No", "-")),
                    "install_date": str(r.get("Install_Date", "2026-10-09")),
                    "agency": str(r.get("Agency", "-")),
                    "phase": str(r.get("Phase", "-")),
                    "tariff": str(r.get("Tariff", "-")),
                    "entered_by": str(r.get("Entered_By", "-"))
                }

    print(f"  [+] Loaded {len(today_installed):,} today's replacement consumer IDs for matching.")

    # Load ULA Metering Sheet 1
    t0 = time.time()
    wb = openpyxl.load_workbook(ULA_EXCEL_PATH, read_only=True, data_only=True)
    ula_records = []
    
    target_sheet = "Sheet 1" if "Sheet 1" in wb.sheetnames else wb.sheetnames[0]
    ws = wb[target_sheet]
    print(f"  [*] Reading '{target_sheet}' from ULA Metering.xlsx...")
    
    for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True)):
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

        # Perform match strictly against today's downloaded replacement meters
        if cid in today_installed:
            inst_info = today_installed[cid]
            status = "Installed"
            agency = inst_info["agency"]
            new_msn = inst_info["new_msn"]
            old_msn = inst_info["old_msn"]
            install_date = inst_info["install_date"]
            phase = inst_info["phase"]
            tariff = inst_info["tariff"]
        else:
            status = "Pending"
            agency = "-"
            new_msn = "-"
            old_msn = "-"
            install_date = "-"
            phase = "-"
            tariff = "-"

        ula_records.append((
            cid, name, address, circle, division, subdivision, section,
            mobile, mi_status, remarks, target_sheet,
            status, agency, new_msn, old_msn, install_date, phase, tariff
        ))

    wb.close()
    print(f"  [+] Read {len(ula_records):,} ULA records in {time.time() - t0:.2f}s.")

    df_ula_final = pd.DataFrame(ula_records, columns=[
        "consumer_id", "consumer_name", "address", "circle", "division",
        "subdivision", "section", "mobile_no", "scope_mi_status", "remarks",
        "sheet_name", "status", "agency", "new_msn", "old_msn", "install_date",
        "phase", "tariff"
    ])

    # Save to local DuckDB and Parquet
    db = duckdb.connect(LOCAL_DB_PATH)
    db.register("df_ula_final", df_ula_final)
    db.execute("CREATE OR REPLACE TABLE ula_scope AS SELECT * FROM df_ula_final")
    
    ula_parquet_p = ULA_CACHE_PARQUET.replace('\\', '/')
    db.execute(f"COPY ula_scope TO '{ula_parquet_p}' (FORMAT PARQUET)")
    db.close()
    
    total_ula = len(df_ula_final)
    installed_today = (df_ula_final["status"] == "Installed").sum()
    pending = (df_ula_final["status"] == "Pending").sum()
    
    print(f"\n[+] ULA Today Tracking Cache Built Successfully!")
    print(f"    Total ULA Scope:          {total_ula:,}")
    print(f"    Installed TODAY in ULA:   {installed_today:,}")
    print(f"    Pending in ULA:           {pending:,}")
    print(f"    Today Non-ULA Installed:  {len(today_installed) - installed_today:,}")
    return df_ula_final

if __name__ == "__main__":
    print("=" * 60)
    print("  STARTING TODAY'S SMART METER INSTALLATION ETL PIPELINE")
    print("=" * 60)
    t_start = time.time()
    compiled = compile_portal_reports()
    build_ula_cache(compiled)
    print(f"\n[*] Total ETL runtime: {time.time() - t_start:.2f}s")
    print("=" * 60)
