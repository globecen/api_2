import json
import os
from PIL import Image, ImageDraw

WIDTH = 14
HEIGHT = 20

# ----------------------------
# 12 MAPS (4 colonnes × 3 lignes)
# ----------------------------
MAP_COORDS = [
    (-1, 2), (0, 2), (1, 2), (2, 2),
    (-1, 1), (0, 1), (1, 1), (2, 1),
    (-1, 0), (0, 0), (1, 0), (2, 0)
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
# GENERATE ONE MAP
# ----------------------------
def generate_map(map_x, map_y, neighbors):
    seed = (map_x * 73856093) ^ (map_y * 19349663)
    rand = mulberry32(seed)

    tiles = []

    for y in range(HEIGHT):
        row = []
        for x in range(WIDTH):
            r = rand()

            if r < 0.05:
                tile = 6  # eau
            elif r < 0.15:
                tile = 7  # arbre
            elif r < 0.20:
                tile = 1  # rocher
            else:
                tile = 0  # sol

            row.append(tile)
        tiles.append(row)

    # ----------------------------
    # PASTILLES INTELLIGENTES
    # ----------------------------
    if neighbors["up"]:
        tiles[0][WIDTH // 2] = 2
    if neighbors["down"]:
        tiles[HEIGHT - 1][WIDTH // 2] = 3
    if neighbors["left"]:
        tiles[HEIGHT // 2][0] = 4
    if neighbors["right"]:
        tiles[HEIGHT // 2][WIDTH - 1] = 5

    return {
        "id": f"{map_x}_{map_y}",
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

    draw = ImageDraw.Draw(img)

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
                    2: (255, 0, 0),      # pastille haut
                    3: (255, 0, 0),      # pastille bas
                    4: (255, 0, 0),      # pastille gauche
                    5: (255, 0, 0),      # pastille droite
                    6: (0, 100, 255),    # eau
                    7: (0, 150, 0)       # arbre
                }.get(t, (255, 255, 255))

                draw.rectangle(
                    [ox + x*TILE, oy + y*TILE, ox + (x+1)*TILE, oy + (y+1)*TILE],
                    fill=color
                )

    img.save("output_maps/preview.png")
    print("✔ Aperçu généré : output_maps/preview.png")

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

    print("\n✔ 12 maps générées + preview avec pastilles")

if __name__ == "__main__":
    main()