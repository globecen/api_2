import duckdb

con = duckdb.connect("game.db")

con.execute("ALTER TABLE characters ADD COLUMN pos_x INTEGER DEFAULT 2;")
con.execute("ALTER TABLE characters ADD COLUMN pos_y INTEGER DEFAULT 2;")

print("✔ Colonnes pos_x et pos_y ajoutées")