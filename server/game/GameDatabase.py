import duckdb
import json
import logging

logger = logging.getLogger("game_server")

class GameDatabase:
    def __init__(self, path: str = "game.db"):
        self.db = duckdb.connect(path, read_only=False)

    # -----------------------------
    # PERSONNAGES
    # -----------------------------
    def count_characters_for_account(self, account_id: int) -> int:
        return self.db.execute(
            "SELECT COUNT(*) FROM characters WHERE account_id = ?",
            [account_id]
        ).fetchone()[0]

    def create_character(self, account_id: int, name: str, char_class: str, appearance: dict):
        # Auto-incrément manuel
        new_id = self.db.execute(
            "SELECT COALESCE(MAX(id), 0) + 1 FROM characters"
        ).fetchone()[0]

        self.db.execute(
            """
            INSERT INTO characters (
                id, account_id, name, level, xp, class, appearance,
                pos_x, pos_y, map_x, map_y
            )
            VALUES (?, ?, ?, 1, 0, ?, ?, 2, 2, 0, 0)
            """,
            [new_id, account_id, name, char_class, json.dumps(appearance)]
        )

        return self.get_character(new_id)

    def get_character(self, char_id: int):
        return self.db.execute(
            """
            SELECT
                id, account_id, name, level, xp, class, appearance,
                pos_x, pos_y, map_x, map_y
            FROM characters
            WHERE id = ?
            """,
            [char_id]
        ).fetchone()

    def list_characters_for_account(self, account_id: int):
        return self.db.execute(
            """
            SELECT
                id, name, level, xp, class, appearance,
                pos_x, pos_y, map_x, map_y
            FROM characters
            WHERE account_id = ?
            """,
            [account_id]
        ).fetchall()

    def update_progress(self, char_id: int, level: int, xp: int):
        self.db.execute(
            """
            UPDATE characters
            SET level = ?, xp = ?
            WHERE id = ?
            """,
            [level, xp, char_id]
        )
        return self.get_character(char_id)

    # -----------------------------
    # POSITION (multi-maps)
    # -----------------------------
    def update_position(self, char_id: int, x: int, y: int, map_x: int, map_y: int):
        self.db.execute("""
            UPDATE characters
            SET pos_x = ?, pos_y = ?, map_x = ?, map_y = ?
            WHERE id = ?
        """, [x, y, map_x, map_y, char_id])

    def get_position(self, char_id: int):
        row = self.db.execute("""
            SELECT pos_x, pos_y, map_x, map_y
            FROM characters
            WHERE id = ?
        """, [char_id]).fetchone()

        if not row:
            # Valeurs par défaut
            return (2, 2, 0, 0)

        return row