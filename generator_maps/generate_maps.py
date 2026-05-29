import json
import os
from PIL import Image
import aggdraw

WIDTH = 14
HEIGHT = 20

# ----------------------------
# 529 MAPS (carré 23×23 centré sur 0_0)
# ----------------------------
MAP_COORDS = [
    (x, y)
    for y in range(-11, 12)
    for x in range(-11, 12)
]

# ----------------------------
# RANDOM SEED
# ----------------------------
def mulberry32(seed):
    def rand():
        nonlocal seed
        seed = (seed + 0x6D2B79F5) & 0xFFFFFFFF
        t = seed
        t = (t ^ (t >> 15)) * (t | 1)
        t ^= t + ((t ^ (t >> 7)) * (t | 61))
        t ^= t >> 14
        return (t & 0xFFFFFFFF) / 4294967296
    return rand

# ----------------------------
# BIOME SELECTION
# ----------------------------
def get_biome(map_x, map_y):
    """
    Détermine le biome en fonction de la position.
    Tu peux changer les règles comme tu veux.
    """

    # Zone centrale = plaine
    if abs(map_x) <= 3 and abs(map_y) <= 3:
        return "plaine"

    # Nord = neige
    if map_y > 6:
        return "neige"

    # Sud = désert
    if map_y < -6:
        return "desert"

    # Ouest = forêt
    if map_x < -6:
        return "foret"

    # Est = montagne
    if map_x > 6:
        return "montagne"

    # Zone intermédiaire = lac
    if abs(map_x) < 6 and abs(map_y) < 6:
        return "lac"

    return "plaine"

# ----------------------------
# GENERATE ONE MAP
# ----------------------------
def generate_map(map_x, map_y, neighbors):
    seed = (map_x * 73856093) ^ (map_y * 19349663)
    rand = mulberry32(seed)

    biome = get_biome(map_x, map_y)
    tiles = []

    # Cases réservées aux pastilles
    reserved = {
        "up":    (WIDTH // 2, 0),
        "down":  (WIDTH // 2, HEIGHT - 1),
        "left":  (0, HEIGHT // 2),
        "right": (WIDTH - 1, HEIGHT // 2)
    }

    for y in range(HEIGHT):
        row = []
        for x in range(WIDTH):

            # Case réservée → sol
            if (x, y) in reserved.values():
                row.append(0)
                continue

            r = rand()

            # ----------------------------
            # BIOME RULES
            # ----------------------------

            if biome == "plaine":
                if r < 0.05: tile = 6  # eau
                elif r < 0.15: tile = 7  # arbre
                elif r < 0.20: tile = 1  # rocher
                else: tile = 0

            elif biome == "foret":
                if r < 0.02: tile = 6
                elif r < 0.50: tile = 7
                elif r < 0.60: tile = 1
                else: tile = 0

            elif biome == "montagne":
                if r < 0.02: tile = 6
                elif r < 0.10: tile = 7
                elif r < 0.60: tile = 1
                else: tile = 0

            elif biome == "lac":
                if r < 0.60: tile = 6
                elif r < 0.70: tile = 7
                else: tile = 0

            elif biome == "desert":
                if r < 0.01: tile = 6
                elif r < 0.03: tile = 7
                elif r < 0.05: tile = 1
                else: tile = 0

            elif biome == "neige":
                if r < 0.05: tile = 6
                elif r < 0.20: tile = 7
                elif r < 0.30: tile = 1
                else: tile = 0

            row.append(tile)
        tiles.append(row)

    # ----------------------------
    # PASTILLES FIXES
    # ----------------------------
    if neighbors["up"]:
        x, y = reserved["up"]
        tiles[y][x] = 2

    if neighbors["down"]:
        x, y = reserved["down"]
        tiles[y][x] = 3

    if neighbors["left"]:
        x, y = reserved["left"]
        tiles[y][x] = 4

    if neighbors["right"]:
        x, y = reserved["right"]
        tiles[y][x] = 5

    return {
        "id": f"{map_x}_{map_y}",
        "biome": biome,
        "width": WIDTH,
        "height": HEIGHT,
        "tiles": tiles
    }

# ----------------------------
# SAVE MAP
# ----------------------------
def save_map(map_data):
    os.makedirs("output_maps", exist_ok=True)
    path = f"output_maps/{map_data['id']}.json"
    with open(path, "w") as f:
        json.dump(map_data, f, indent=2)
    print(f"✔ Map générée : {path}")

# ----------------------------
# PREVIEW VISUELLE
# ----------------------------
def generate_preview(all_maps):
    TILE = 16
    PADDING = 4

    xs = [mx for mx, my in MAP_COORDS]
    ys = [my for mx, my in MAP_COORDS]

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    cols = max_x - min_x + 1
    rows = max_y - min_y + 1

    img = Image.new("RGB", (
        cols * (WIDTH * TILE + PADDING),
        rows * (HEIGHT * TILE + PADDING)
    ), (30, 30, 30))

    draw = aggdraw.Draw(img)

    brush_cache = {}
    pen = aggdraw.Pen("black", 1)

    def get_brush(color):
        if color not in brush_cache:
            brush_cache[color] = aggdraw.Brush(color)
        return brush_cache[color]

    for map_data in all_maps:
        mx, my = map_data["id"].split("_")
        mx, my = int(mx), int(my)

        col = mx - min_x
        row = max_y - my

        ox = col * (WIDTH * TILE + PADDING)
        oy = row * (HEIGHT * TILE + PADDING)

        for y in range(HEIGHT):
            for x in range(WIDTH):
                t = map_data["tiles"][y][x]

                color = {
                    0: (200, 200, 200),  # sol
                    1: (100, 100, 100),  # rocher
                    2: (255, 255, 0),    # pastille haut
                    3: (255, 255, 0),    # pastille bas
                    4: (255, 255, 0),    # pastille gauche
                    5: (255, 255, 0),    # pastille droite
                    6: (0, 100, 255),    # eau
                    7: (0, 150, 0)       # arbre
                }.get(t, (255, 255, 255))

                x1 = ox + x*TILE
                y1 = oy + y*TILE
                x2 = x1 + TILE
                y2 = y1 + TILE

                draw.rectangle([x1, y1, x2, y2], pen, get_brush(color))

    draw.flush()
    img.save("output_maps/preview.png")
    print("✔ Aperçu généré avec Aggdraw : output_maps/preview.png")

# ----------------------------
# MAIN
# ----------------------------
def main():
    all_maps = []

    for mx, my in MAP_COORDS:

        neighbors = {
            "up": (mx, my+1) in MAP_COORDS,
            "down": (mx, my-1) in MAP_COORDS,
            "left": (mx-1, my) in MAP_COORDS,
            "right": (mx+1, my) in MAP_COORDS
        }

        m = generate_map(mx, my, neighbors)
        save_map(m)
        all_maps.append(m)

    generate_preview(all_maps)

    print("\n✔ 529 maps générées + biomes + pastilles propres")

if __name__ == "__main__":
    main()