import os
import sqlite3
import secrets
import time
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from gateway.identity import get_db_connection

# Initialize tickets table
def init_tickets_db():
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS human_review_tickets (
                ticket_id TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending_approval',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP,
                reviewed_by TEXT
            )
        """)
        # Seed initial pending tickets if table is empty
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM human_review_tickets")
        if cursor.fetchone()[0] == 0:
            conn.execute("""
                INSERT INTO human_review_tickets (ticket_id, prompt, reason, status, created_at)
                VALUES 
                ('tkt_9a12c8', 'DELETE FROM users WHERE account_age_days > 365 AND is_active = 0', 'Mass bulk deletion of user account records requested via automated agent.', 'pending_approval', '2026-10-30 21:10:00'),
                ('tkt_3f44b1', 'Initiate international wire transfer of $15,000 to escrow account AC-9912.', 'Financial transaction exceeding the $5,000 autonomous execution threshold.', 'pending_approval', '2026-10-30 22:30:00'),
                ('tkt_7b08d4', 'Rotate all root JWT secrets and force-terminate active API sessions.', 'High-privilege security credentials invalidation.', 'pending_approval', '2026-10-31 00:15:00')
            """)
        conn.commit()


def create_human_review_ticket(prompt: str, reason: str) -> str:
    """
    08 Human in the Loop:
    Halts LLM execution and stores high-risk requests in the audit review queue.
    """
    ticket_id = f"tkt_{secrets.token_hex(4)}"
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO human_review_tickets (ticket_id, prompt, reason, status)
            VALUES (?, ?, ?, 'pending_approval')
            """,
            (ticket_id, prompt, reason)
        )
        conn.commit()
    return ticket_id


def list_pending_tickets() -> List[Dict[str, Any]]:
    """
    Returns all escalation tickets waiting for human agent review.
    """
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM human_review_tickets WHERE status = 'pending_approval' ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def list_all_tickets() -> List[Dict[str, Any]]:
    """
    Returns all escalation tickets (pending, approved, rejected) for the Admin console.
    """
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM human_review_tickets ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def review_ticket(ticket_id: str, decision: str, reviewer_name: str = "Human Supervisor") -> Dict[str, Any]:
    """
    Approves or rejects an escalation ticket.
    Decision must be 'approved' or 'rejected'.
    """
    if decision not in ["approved", "rejected"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decision must be either 'approved' or 'rejected'."
        )

    with get_db_connection() as conn:
        ticket = conn.execute(
            "SELECT * FROM human_review_tickets WHERE ticket_id = ?",
            (ticket_id,)
        ).fetchone()

        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ticket '{ticket_id}' not found."
            )

        conn.execute(
            """
            UPDATE human_review_tickets
            SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
            WHERE ticket_id = ?
            """,
            (decision, reviewer_name, ticket_id)
        )
        conn.commit()

    return {
        "ticket_id": ticket_id,
        "new_status": decision,
        "reviewed_by": reviewer_name,
        "message": f"Ticket '{ticket_id}' successfully marked as '{decision}'."
    }


# Auto-initialize table on import
init_tickets_db()
