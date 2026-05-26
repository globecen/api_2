import duckdb
import logging

logger = logging.getLogger("auth_server")

class AuthDatabase:
    def __init__(self, path: str = "auth.db"):
        self.db = duckdb.connect(path, read_only=False)

    # -----------------------------
    # COMPTES
    # -----------------------------
    def get_account_by_username(self, username: str):
        return self.db.execute(
            "SELECT id, username, password_hash FROM accounts WHERE username = ?",
            [username]
        ).fetchone()

    def create_account(self, username: str, password_hash: str) -> int:
        new_id = self.db.execute(
            "SELECT COALESCE(MAX(id), 0) + 1 FROM accounts"
        ).fetchone()[0]

        self.db.execute(
            "INSERT INTO accounts (id, username, password_hash) VALUES (?, ?, ?)",
            [new_id, username, password_hash]
        )

        return new_id

    # -----------------------------
    # SESSIONS
    # -----------------------------
    def create_session(self, session_id: str, account_id: int, expires_at: int):
        new_id = self.db.execute(
            "SELECT COALESCE(MAX(id), 0) + 1 FROM sessions"
        ).fetchone()[0]

        self.db.execute(
            """
            INSERT INTO sessions (id, session_id, account_id, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            [new_id, session_id, account_id, expires_at]
        )

    def get_session(self, session_id: str):
        return self.db.execute(
            "SELECT session_id, account_id, expires_at FROM sessions WHERE session_id = ?",
            [session_id]
        ).fetchone()

    def delete_session(self, session_id: str):
        self.db.execute(
            "DELETE FROM sessions WHERE session_id = ?",
            [session_id]
        )