import sqlite3
from typing import Dict, Any, List, Optional
from gateway.identity import get_db_connection

# =====================================================================
# LAYER D: EVALUATION - USER FEEDBACK STORE (SQLite)
# =====================================================================

def init_feedback_db():
    """Initializes the user feedback table in the SQLite database."""
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trace_id TEXT NOT NULL,
                rating INTEGER,
                thumbs TEXT,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


# Initialize table on import
init_feedback_db()


def submit_feedback(
    trace_id: str,
    rating: Optional[int] = None,
    thumbs: Optional[str] = None,
    comment: Optional[str] = None
) -> Dict[str, Any]:
    """
    Records end-user feedback (ratings, thumbs up/down, corrections)
    mapped directly to a distributed request trace_id.
    """
    clean_thumbs = thumbs.lower().strip() if thumbs else None
    if clean_thumbs and clean_thumbs not in ["up", "down"]:
        clean_thumbs = None

    with get_db_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO user_feedback (trace_id, rating, thumbs, comment)
            VALUES (?, ?, ?, ?)
        """, (trace_id.strip(), rating, clean_thumbs, comment))
        conn.commit()
        feedback_id = cursor.lastrowid ## Gives the Primary key.
    
    return {
        "status": "success",
        "feedback_id": feedback_id,
        "trace_id": trace_id,
        "message": "Feedback recorded successfully for evaluation and RLHF."
    }


def get_feedback_summary() -> Dict[str, Any]:
    """
    Aggregates user satisfaction ratings:
    - Total submissions
    - Thumbs up vs Thumbs down counts
    - Positive satisfaction percentage
    - Recent user comments
    """
    with get_db_connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM user_feedback").fetchone()[0]
        thumbs_up = conn.execute("SELECT COUNT(*) FROM user_feedback WHERE thumbs = 'up'").fetchone()[0]
        thumbs_down = conn.execute("SELECT COUNT(*) FROM user_feedback WHERE thumbs = 'down'").fetchone()[0]

        recent_rows = conn.execute("""
            SELECT id, trace_id, rating, thumbs, comment, created_at 
            FROM user_feedback 
            ORDER BY created_at DESC 
            LIMIT 10
        """).fetchall()

    satisfaction_rate = "N/A"
    if (thumbs_up + thumbs_down) > 0:
        rate = (thumbs_up / (thumbs_up + thumbs_down)) * 100
        satisfaction_rate = f"{round(rate, 1)}%"

    return {
        "total_feedbacks": total,
        "thumbs_up": thumbs_up,
        "thumbs_down": thumbs_down,
        "satisfaction_rate": satisfaction_rate,
        "recent_feedback": [dict(row) for row in recent_rows]
    }
