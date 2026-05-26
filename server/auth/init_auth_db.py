import duckdb

con = duckdb.connect("auth.db")

con.execute("""
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);
""")

con.execute("""
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    account_id INTEGER NOT NULL,
    expires_at BIGINT NOT NULL
);
""")

print("auth.db initialisé.")
    con.close()