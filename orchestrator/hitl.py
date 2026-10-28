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
