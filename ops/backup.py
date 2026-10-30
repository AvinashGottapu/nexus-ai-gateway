import os
import sys
import time
import sqlite3
import shutil
from datetime import datetime
from typing import List, Dict, Any

# Ensure UTF-8 output on Windows terminals
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# =====================================================================
# LAYER D: RELEASE + RECOVERY - AUTOMATED DATABASE BACKUP ENGINE
# =====================================================================

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_SOURCE_PATH = os.path.join(ROOT_DIR, "gateway", "gateway.db")
BACKUP_DIR = os.path.join(ROOT_DIR, "backups")
MAX_BACKUPS_RETAINED = 7  # Retain rolling window of last 7 backups


def init_backup_directory() -> str:
    """Ensures the local backups directory exists."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    return BACKUP_DIR


def create_backup(tag: str = "auto") -> Dict[str, Any]:
    """
    Creates an atomic point-in-time snapshot of gateway.db using SQLite's
    online backup API (zero downtime, non-blocking, safe during active traffic).
    """
    init_backup_directory()

    if not os.path.exists(DB_SOURCE_PATH):
        raise FileNotFoundError(f"Database file not found at: {DB_SOURCE_PATH}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"gateway_backup_{timestamp}_{tag}.db"
    backup_file_path = os.path.join(BACKUP_DIR, backup_filename)
    # Generates a name like gateway_backup_20261030_011307_auto.db so two backups never overwrite each other.

    t0 = time.perf_counter()

    # SQLite native non-blocking online backup API
    source_conn = sqlite3.connect(DB_SOURCE_PATH)
    target_conn = sqlite3.connect(backup_file_path)

    try:
        with target_conn:
            source_conn.backup(target_conn, pages=100, sleep=0.01)
            # Tells SQLite to copy the database in batches of 100 memory/disk pages at a time
            # Pauses for 10 milliseconds between each batch.
    finally:
        target_conn.close()
        source_conn.close()

    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    file_size_bytes = os.path.getsize(backup_file_path)
    file_size_kb = round(file_size_bytes / 1024, 2)

    # Automatically prune old backups to maintain the 7-backup retention limit
    pruned_count = prune_old_backups(max_retained=MAX_BACKUPS_RETAINED)

    return {
        "status": "success",
        "backup_filename": backup_filename,
        "backup_path": backup_file_path,
        "size_kb": file_size_kb,
        "duration_ms": duration_ms,
        "created_at": datetime.now().isoformat(),
        "pruned_old_backups": pruned_count
    }


def list_backups() -> List[Dict[str, Any]]:
    """Lists all available database backup snapshots sorted from newest to oldest."""
    init_backup_directory()
    backups = []

    for fname in os.listdir(BACKUP_DIR):
        if fname.startswith("gateway_backup_") and fname.endswith(".db"):
            fpath = os.path.join(BACKUP_DIR, fname)
            stat = os.stat(fpath)
            backups.append({
                "filename": fname,
                "path": fpath,
                "size_kb": round(stat.st_size / 1024, 2),
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })

    # Sort newest first
    backups.sort(key=lambda b: b["modified_at"], reverse=True)
    return backups


def prune_old_backups(max_retained: int = MAX_BACKUPS_RETAINED) -> int:
    """Removes older backups when total count exceeds retention limit."""
    backups = list_backups()
    if len(backups) <= max_retained:
        return 0

    to_delete = backups[max_retained:]
    deleted_count = 0
    for b in to_delete:
        try:
            os.remove(b["path"])
            deleted_count += 1
        except Exception as e:
            print(f"⚠️ Warning: Could not remove old backup '{b['filename']}': {e}")

    return deleted_count


if __name__ == "__main__":
    print("\n" + "=" * 65)
    print(" 💾 LAYER D: CREATING DATABASE BACKUP SNAPSHOT")
    print("=" * 65)
    result = create_backup(tag="manual")
    print(f" ✅ Backup Created:  {result['backup_filename']}")
    print(f" 📂 Path:            {result['backup_path']}")
    print(f" 📦 Size:            {result['size_kb']} KB")
    print(f" ⏱️ Duration:        {result['duration_ms']} ms")
    print(f" 🗑️ Pruned Backups:  {result['pruned_old_backups']}")
    print("=" * 65 + "\n")
