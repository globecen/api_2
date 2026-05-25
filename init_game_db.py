import duckdb

con = duckdb.connect("game.db")

# Création de base si absente
con.execute("""
CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0
);
""")

# Table de chat compatible DuckDB
con.execute("""
CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    instance_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id INTEGER,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""")

def column_exists(name: str) -> bool:
    cols = con.execute("PRAGMA table_info('characters')").fetchall()
    return any(c[1] == name for c in cols)

# Ajout colonne class
if not column_exists("class"):
    con.execute("ALTER TABLE characters ADD COLUMN class TEXT DEFAULT 'Guerrier';")
    print("Colonne 'class' ajoutée.")

# Ajout colonne appearance
if not column_exists("appearance"):
    con.execute("ALTER TABLE characters ADD COLUMN appearance TEXT DEFAULT '{}';")
    print("Colonne 'appearance' ajoutée.")

print("game.db initialisé / mis à jour.")