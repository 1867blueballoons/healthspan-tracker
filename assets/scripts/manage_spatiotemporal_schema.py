#!/usr/bin/env python3
"""
Hoh Analytica - Spatio-Temporal Environmental Schema Engine
Instantiates compound primary keys (location, entry_date) across environmental tables.
Features forced root logger initialization for complete execution visibility.
"""

import os
import sys
import sqlite3
import logging
from pathlib import Path

# ======================================================================================
# 1. IMMEDIATE FORCED LOGGING INITIALIZATION (Fixes Silent Execution)
# ======================================================================================
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True  # Overrides any root loggers instantiated during early module imports
)

logging.info("==================================================================")
logging.info("Starting Hoh Analytica Spatio-Temporal Schema Migration Engine")
logging.info("==================================================================")

# ======================================================================================
# 2. DYNAMIC SYS.PATH INJECTION & CONFIG BINDING
# ======================================================================================
CONFIG_MODULE_DIR = Path(os.path.expanduser("~/dev/config")).resolve()
logging.info(f"Targeting Central Config Directory: {CONFIG_MODULE_DIR}")

if not CONFIG_MODULE_DIR.exists():
    logging.critical(f"[!] Directory Error: Config directory does not exist at {CONFIG_MODULE_DIR}")
    sys.exit(1)

if str(CONFIG_MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(CONFIG_MODULE_DIR))
    logging.debug(f"Prepend sys.path[0] -> {CONFIG_MODULE_DIR}")

try:
    import config_manager
    logging.info(f"[✓] Successfully bound Central Config Manager from {CONFIG_MODULE_DIR}")
except ModuleNotFoundError as err:
    logging.critical(
        f"[!] Import Failure: Could not find 'config_manager.py' inside {CONFIG_MODULE_DIR}.\n"
        f"    Ensure the file exists at: {CONFIG_MODULE_DIR / 'config_manager.py'}\n"
        f"    Raw Error: {err}"
    )
    sys.exit(1)
except Exception as err:
    logging.critical(f"[!] Unhandled exception during config_manager import: {err}")
    sys.exit(1)


# ======================================================================================
# 3. DATABASE CONNECTION ENGINE
# ======================================================================================
def get_db_connection(db_path: Path) -> sqlite3.Connection:
    """
    Establishes an atomic SQLite connection enforcing WAL mode and PRAGMA integrity checks.
    """
    timeout = float(config_manager.get_key("TIMEOUT_SECONDS", 30.0))
    logging.info(f"Opening atomic SQLite connection: {db_path} (Timeout: {timeout}s)")
    
    conn = sqlite3.connect(db_path, timeout=timeout)
    
    if config_manager.get_key("WAL_MODE", True):
        conn.execute("PRAGMA journal_mode=WAL;")
        logging.debug("PRAGMA journal_mode=WAL enforced.")
    if config_manager.get_key("ENFORCE_FOREIGN_KEYS", True):
        conn.execute("PRAGMA foreign_keys=ON;")
        logging.debug("PRAGMA foreign_keys=ON enforced.")
        
    return conn


# ======================================================================================
# 4. COMPOUND SPATIO-TEMPORAL DDL SCHEMA
# ======================================================================================
SPATIO_TEMPORAL_DDL_SCRIPT = """
-- 1. Daily Meteorological Forecast Table (Compound Spatio-Temporal Key)
CREATE TABLE IF NOT EXISTS env_daily_forecast (
    location TEXT NOT NULL DEFAULT 'Wilmslow',
    entry_date TEXT NOT NULL,
    temp_min_c REAL,
    temp_max_c REAL,
    humidity_mean REAL,
    precipitation_sum_mm REAL,
    is_imputed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (location, entry_date)
);

-- 2. Daily Pollen Metrics Table (Compound Spatio-Temporal Key)
CREATE TABLE IF NOT EXISTS env_daily_pollen (
    location TEXT NOT NULL DEFAULT 'Wilmslow',
    entry_date TEXT NOT NULL,
    pollen_level TEXT,            -- 'Low', 'Moderate', 'High', 'Very High'
    pollen_numeric INTEGER,        -- 0: Low, 1: Moderate, 2: High, 3: Very High
    grass_pollen_grains REAL,
    tree_pollen_grains REAL,
    weed_pollen_grains REAL,
    is_imputed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (location, entry_date)
);
"""


def execute_schema_migration(conn: sqlite3.Connection, sql_script: str) -> None:
    """ Executes DDL statements within an atomic transaction block. """
    cursor = conn.cursor()
    try:
        logging.info("Executing Spatio-Temporal DDL Script...")
        cursor.executescript(sql_script)
        conn.commit()
        logging.info("[✓] DDL transaction committed successfully.")
    except sqlite3.Error as e:
        conn.rollback()
        logging.error(f"[!] SQL Migration Error: {e}")
        raise e


def verify_tables_exist(conn: sqlite3.Connection) -> None:
    """ Inspects SQLite schema via PRAGMA table_info to verify compound primary keys. """
    cursor = conn.cursor()
    target_tables = ['env_daily_forecast', 'env_daily_pollen']
    
    for table in target_tables:
        cursor.execute(f"PRAGMA table_info({table});")
        columns = cursor.fetchall()
        col_names = [row[1] for row in columns]
        pk_cols = [row[1] for row in columns if row[5] > 0]
        
        if columns:
            logging.info(f"[✓] VERIFIED: '{table}' | PK Vector: {pk_cols} | Columns: {col_names}")
        else:
            logging.error(f"[!] FAILED: Table '{table}' was not created.")


# ======================================================================================
# 5. MAIN EXECUTION PIPELINE
# ======================================================================================
def main():
    try:
        db_file_path = config_manager.get_db_path()
        default_loc = config_manager.get_key("DEFAULT_LOCATION", "Wilmslow")
        
        logging.info(f"Target Database File: {db_file_path}")
        logging.info(f"Default Location Setting: '{default_loc}'")

        with get_db_connection(db_file_path) as conn:
            execute_schema_migration(conn, SPATIO_TEMPORAL_DDL_SCRIPT)
            verify_tables_exist(conn)
            
        logging.info("=================================================")
        logging.info("Migration Completed Successfully")
        logging.info("=================================================")
            
    except Exception as err:
        logging.critical(f"[!] Unhandled Execution Failure: {err}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()