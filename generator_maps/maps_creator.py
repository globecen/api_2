import json
import tkinter as tk
from tkinter import filedialog

WIDTH = 14
HEIGHT = 20
TILE = 32

# Couleurs des tuiles
TILE_COLORS = {
    0: "#d0d0d0",  # sol
    1: "#555555",  # rocher
    2: "#ff0000",  # pastille haut
    3: "#ff0000",  # pastille bas
    4: "#ff0000",  # pastille gauche
    5: "#ff0000",  # pastille droite
    6: "#0066ff",  # eau
    7: "#009900",  # arbre
    8: "#e0c068",  # sable
    9: "#ffffff",  # neige
}

current_tile = 0

class MapEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("Éditeur de Map - Julien Edition")

        self.canvas = tk.Canvas(root, width=WIDTH*TILE, height=HEIGHT*TILE, bg="black")
        self.canvas.grid(row=0, column=0, rowspan=30)

        self.tiles = [[0 for _ in range(WIDTH)] for _ in range(HEIGHT)]

        # Palette
        row = 0
        for tile_id, color in TILE_COLORS.items():
            btn = tk.Button(root, bg=color, width=4, height=2,
                            command=lambda t=tile_id: self.set_tile(t))
            btn.grid(row=row, column=1)
            row += 1

        # Boutons
        tk.Button(root, text="Charger JSON", command=self.load_json).grid(row=row, column=1)
        row += 1
        tk.Button(root, text="Sauver JSON", command=self.save_json).grid(row=row, column=1)

        self.canvas.bind("<Button-1>", self.paint)
        self.draw()

    def set_tile(self, t):
        global current_tile
        current_tile = t

    def paint(self, event):
        x = event.x // TILE
        y = event.y // TILE
        if 0 <= x < WIDTH and 0 <= y < HEIGHT:
            self.tiles[y][x] = current_tile
            self.draw()

    def draw(self):
        self.canvas.delete("all")
        for y in range(HEIGHT):
            for x in range(WIDTH):
                t = self.tiles[y][x]
                color = TILE_COLORS.get(t, "white")
                self.canvas.create_rectangle(
                    x*TILE, y*TILE, (x+1)*TILE, (y+1)*TILE,
                    fill=color, outline="#333"
                )

    def load_json(self):
        path = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if not path:
            return
        with open(path, "r") as f:
            data = json.load(f)
        self.tiles = data["tiles"]
        self.draw()

    def save_json(self):
        path = filedialog.asksaveasfilename(defaultextension=".json")
        if not path:
            return
        data = {
            "id": "custom",
            "width": WIDTH,
            "height": HEIGHT,
            "tiles": self.tiles
        }
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

root = tk.Tk()
app = MapEditor(root)
root.mainloop()