#!/usr/bin/env python3
"""
Hoh Analytica - Environmental Schema Migration & Management Engine
Executes environmental DDL scripts against SQLite with dynamic path resolution.
"""

import os
import sys
import sqlite3
import logging
from pathlib import Path

# Configure Structured Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

# CENTRALIZED KEY-VALUE CONFIGURATION MAPPING
CONFIG = {
    # Dynamically reads env var or falls back to your target local analytics path
    "DB_LOCATION": os.getenv(
        "HOH_DB_PATH", 
        "~dev/analytics/Hoh_Analytica/db/hoh_telemetry.db"
    ),
    "TIMEOUT_SECONDS": 30.0,
    "WAL_MODE": True,
    "ENFORCE_FOREIGN_KEYS": True
}


def resolve_db_path(raw_path: str) -> Path:
    """
    Expands user tilde (~) and returns an absolute Path object for the target SQLite DB.
    """
    expanded = Path(os.path.expanduser(raw_path)).resolve()
    if not expanded.parent.exists():
        logging.info(f"Creating missing directory tree: {expanded.parent}")
        expanded.parent.mkdir(parents=True, exist_ok=True)
    return expanded


def get_db_connection(db_path: Path) -> sqlite3.Connection:
    """
    Establishes a SQLite connection with WAL mode and PRAGMA integrity checks.
    """
    logging.info(f"Opening atomic connection to: {db_path}")
    conn = sqlite3.connect(db_path, timeout=CONFIG["TIMEOUT_SECONDS"])
    
    if CONFIG["WAL_MODE"]:
        conn.execute("PRAGMA journal_mode=WAL;")
    if CONFIG["ENFORCE_FOREIGN_KEYS"]:
        conn.execute("PRAGMA foreign_keys=ON;")
        
    return conn


# TARGET SQL DDL SCRIPT
ENVIRONMENT_DDL_SCRIPT = """
-- 1. Daily Meteorological Forecast Table
CREATE TABLE IF NOT EXISTS env_daily_forecast (
    entry_date TEXT PRIMARY KEY,
    temp_min_c REAL,
    temp_max_c REAL,
    humidity_mean REAL,
    precipitation_sum_mm REAL,
    is_imputed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Daily Pollen Metrics Table
CREATE TABLE IF NOT EXISTS env_daily_pollen (
    entry_date TEXT PRIMARY KEY,
    pollen_level TEXT,            -- 'Low', 'Moderate', 'High', 'Very High'
    pollen_numeric INTEGER,        -- 0: Low, 1: Moderate, 2: High, 3: Very High
    grass_pollen_grains REAL,
    tree_pollen_grains REAL,
    weed_pollen_grains REAL,
    is_imputed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def execute_schema_migration(conn: sqlite3.Connection, sql_script: str) -> None:
    """
    Executes raw SQL DDL scripts inside an atomic transaction.
    """
    cursor = conn.cursor()
    try:
        logging.info("Executing Environmental Schema DDL Transaction...")
        cursor.executescript(sql_script)
        conn.commit()
        logging.info("Schema DDL transaction committed successfully.")
    except sqlite3.Error as e:
        conn.rollback()
        logging.error(f"SQL Schema Migration Error: {e}")
        raise e


def verify_tables_exist(conn: sqlite3.Connection) -> None:
    """
    Verifies that target tables exist and prints column signatures.
    """
    cursor = conn.cursor()
    target_tables = ['env_daily_forecast', 'env_daily_pollen']
    
    for table in target_tables:
        cursor.execute(f"PRAGMA table_info({table});")
        columns = [row[1] for row in cursor.fetchall()]
        if columns:
            logging.info(f"[✓] Table verified: '{table}' | Columns: {columns}")
        else:
            logging.error(f"[!] Verification failed: Table '{table}' was not created.")


def main():
    # 1. Resolve Key-Value Database Location
    db_file_path = resolve_db_path(CONFIG["DB_LOCATION"])

    # 2. Execute Schema Migration within Context Manager
    try:
        with get_db_connection(db_file_path) as conn:
            execute_schema_migration(conn, ENVIRONMENT_DDL_SCRIPT)
            verify_tables_exist(conn)
            
    except Exception as err:
        logging.critical(f"Pipeline Schema Initialization Failed: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()