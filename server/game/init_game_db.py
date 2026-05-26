import duckdb

con = duckdb.connect("game.db")

# ----------------------------
# CHARACTERS TABLE (SIMPLE + SAFE + POSITION)
# ----------------------------
con.execute("""
CREATE TABLE IF NOT EXISTS characters (
    id INTEGER,
    account_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    class TEXT NOT NULL DEFAULT 'Guerrier',
    appearance TEXT NOT NULL DEFAULT '{}',

    -- POSITION (MMO SAVE SYSTEM)
    pos_x INTEGER NOT NULL DEFAULT 2,
    pos_y INTEGER NOT NULL DEFAULT 2,

    -- STATS
    hp INTEGER NOT NULL DEFAULT 100,
    mana INTEGER NOT NULL DEFAULT 50,
    force INTEGER NOT NULL DEFAULT 5,
    agilite INTEGER NOT NULL DEFAULT 5,
    intelligence INTEGER NOT NULL DEFAULT 5
);
""")

# ----------------------------
# CHAT SYSTEM
# ----------------------------
con.execute("""
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER,
    instance_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id INTEGER,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""")

print("✔ Tables créées (DuckDB SAFE mode + POSITION SYSTEM)")
    con.close()