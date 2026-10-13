import duckdb
import os
import time

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT_DIR = os.path.join(WORKSPACE_DIR, "data")
DEFAULT_SOURCE_PATTERN = os.path.join(WORKSPACE_DIR, "extracted_smart_meters", "Total Smart Meters Installed_*.csv").replace("\\", "/")

def run_etl(source_pattern=None, output_dir=None):
    if source_pattern is None:
        source_pattern = DEFAULT_SOURCE_PATTERN
    if output_dir is None:
        output_dir = DEFAULT_OUTPUT_DIR

    t0 = time.time()
    os.makedirs(output_dir, exist_ok=True)
    parquet_path = os.path.join(output_dir, "smart_meters.parquet").replace("\\", "/")
    db_path = os.path.join(output_dir, "smart_meters.duckdb").replace("\\", "/")
    
    print(f"[*] Starting Vectorized ETL Pipeline from: {source_pattern}", flush=True)
    con = duckdb.connect(db_path)
    
    # 1. Clean and transform data directly with DuckDB into Parquet
    print("[*] Parsing, cleaning, and appending CSV batches...", flush=True)
    con.execute(f"""
        CREATE OR REPLACE TABLE meters AS
        SELECT 
            trim(Circle) as circle,
            trim(Division) as division,
            trim(Subdivision) as subdivision,
            trim(Section) as section,
            trim(Feeder) as feeder_code,
            trim(DT_Code) as dt_code,
            trim(DTR_Name) as dt_name,
            trim(ConsumerNumber) as consumer_number,
            trim(Name) as consumer_name,
            trim(New_MSN) as new_msn,
            trim(Old_MSN) as old_msn,
            COALESCE(NULLIF(trim("New ManufacturerName"), ''), 'UNKNOWN') as meter_make,
            COALESCE(NULLIF(trim("New Phase"), ''), 'UNKNOWN') as phase,
            CASE 
                WHEN "Entered By" LIKE '%_%' THEN upper(trim(string_split("Entered By", '_')[-1]))
                ELSE 'OTHER'
            END as agency,
            trim("Entered By") as entered_by,
            trim(HES) as hes,
            trim(InstallationType) as installation_type,
            trim("Auto Status") as auto_status,
            trim("Supervisor Status") as supervisor_status,
            trim(Tariff) as tariff,
            try_cast(replace(CONN_LOAD, ',', '') as DOUBLE) as conn_load,
            "InstallationDatetime" as raw_install_datetime,
            try_strptime("InstallationDatetime", '%d %b %Y %H:%M:%S') as install_timestamp,
            cast(try_strptime("InstallationDatetime", '%d %b %Y %H:%M:%S') as DATE) as install_date,
            strftime(try_strptime("InstallationDatetime", '%d %b %Y %H:%M:%S'), '%Y-%m') as install_month,
            strftime(try_strptime("InstallationDatetime", '%d %b %Y %H:%M:%S'), '%Y') as install_year,
            strftime(try_strptime("InstallationDatetime", '%d %b %Y %H:%M:%S'), '%a') as install_day_of_week
        FROM read_csv_auto('{source_pattern}', all_varchar=True)
        WHERE New_MSN IS NOT NULL AND trim(New_MSN) != ''
        QUALIFY ROW_NUMBER() OVER (PARTITION BY trim(New_MSN) ORDER BY try_strptime("InstallationDatetime", '%d %b %Y %H:%M:%S') DESC NULLS LAST) = 1
    """)
    
    # 2. Export to Snappy-compressed Parquet for ultra-fast columnar access
    print("[*] Exporting to optimized Parquet...", flush=True)
    con.execute(f"COPY meters TO '{parquet_path}' (FORMAT PARQUET, COMPRESSION SNAPPY)")
    
    # 3. Create indexes for instant filtering
    print("[*] Creating database indexes...", flush=True)
    con.execute("CREATE INDEX IF NOT EXISTS idx_circle ON meters(circle)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_division ON meters(division)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_subdivision ON meters(subdivision)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_agency ON meters(agency)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_make ON meters(meter_make)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_phase ON meters(phase)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_date ON meters(install_date)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_feeder ON meters(feeder_code)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_dt ON meters(dt_code)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_inst_type ON meters(installation_type)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_tariff ON meters(tariff)")
    
    # Verify count and size
    count = con.execute("SELECT count(*) FROM meters").fetchone()[0]
    file_size_mb = os.path.getsize(parquet_path) / (1024 * 1024)
    duration = time.time() - t0
    
    print(f"[+] Successfully loaded {count:,} records in {round(duration, 2)}s!", flush=True)
    print(f"[+] Generated Parquet: {parquet_path} ({round(file_size_mb, 2)} MB)", flush=True)
    con.close()
    return count

def run_full_pipeline():
    return run_etl()

if __name__ == "__main__":
    run_etl()
