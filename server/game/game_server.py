from fastapi import Body, FastAPI, HTTPException, Header, WebSocket, WebSocketDisconnect, Depends
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import requests, json
import redis
import os
from init_game_db import init_game_db
from GameDatabase import GameDatabase
from anti_cheat import AntiCheat
from settings import AUTH_URL, URL_REDIS
import asyncio

print("ENV =", os.getenv("ENV"))
print("AUTH_URL =", AUTH_URL)
print("URL_REDIS =", URL_REDIS)

remote_players_connections: dict[int, list[WebSocket]] = {}

# instance_id -> { account_id -> player_data }
instance_players_state = {}
app = FastAPI()
init_game_db()
r = redis.Redis(host=URL_REDIS, port=6379, decode_responses=True)
@app.on_event("startup")
def startup_event():
    print("🧹 Reset des instances...")

    # 1. clean instances
    instances = r.smembers("instances")

    for inst_id in instances:
        r.delete(f"instance:{inst_id}:players")

    r.delete("instances")

    # 2. clean players mapping
    for k in r.keys("player:*"):
        r.delete(k)

    # 3. reset compteur (optionnel mais conseillé)
    r.set("instance_counter", 1)

    # 4. création instance par défaut
    default_id = 1

    r.sadd("instances", default_id)
    r.delete(f"instance:{default_id}:players")

    print(f"🆕 Instance par défaut créée: {default_id}")

    print("✅ Startup terminé proprement")
db = GameDatabase("game.db")
anti_cheat = AntiCheat()

# Redis
chat_connections: dict[int, list[WebSocket]] = {}

MAX_PLAYERS = 10
BASE_STATS = {
    "Guerrier": {
        "hp": 120,
        "mana": 50,
        "force": 15,
        "agilite": 5,
        "intelligence": 2
    },
    "Mage": {
        "hp": 65,
        "mana": 120,
        "force": 2,
        "agilite": 8,
        "intelligence": 18
    },
    "Archer": {
        "hp": 90,
        "mana": 70,
        "force": 8,
        "agilite": 15,
        "intelligence": 6
    },
    "Nécromancien": {
        "hp": 80,
        "mana": 130,
        "force": 6,
        "agilite": 7,
        "intelligence": 16
    }
}
    
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# MODELES / CONSTANTES
# -----------------------------
class CharacterCreate(BaseModel):
    name: str
    char_class: str
    appearance: dict

VALID_CLASSES = ["Guerrier", "Mage", "Archer", "Nécromancien"]

# -----------------------------
# VALIDATION DE SESSION
# -----------------------------
def get_current_account(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(401, "Session manquante.")

    r2 = requests.get(
        f"{AUTH_URL}/validate_session",
        headers={"Authorization": authorization}
    )

    if r2.status_code != 200:
        raise HTTPException(401, "Session invalide.")

    return r2.json()["account_id"]

# -----------------------------
# WEBSOCKETS INSTANCES
# -----------------------------
websocket_clients = set()

async def broadcast_instances():
    data = {"instances": get_status()}
    dead = []

    for ws in websocket_clients:
        try:
            await ws.send_text(json.dumps(data))
        except:
            dead.append(ws)

    for ws in dead:
        websocket_clients.remove(ws)

@app.websocket("/ws/instances")
async def ws_instances(ws: WebSocket):
    await ws.accept()
    websocket_clients.add(ws)

    # Envoi initial
    await ws.send_text(json.dumps({"instances": get_status()}))

    try:
        while True:
            msg = await ws.receive_text()

            # Réponse au ping
            if msg.startswith("ping:"):
                timestamp = msg.split(":")[1]
                await ws.send_text(json.dumps({"pong": timestamp}))
                continue

    except WebSocketDisconnect:
        websocket_clients.remove(ws)

# -----------------------------
# INSTANCES VIA REDIS
# -----------------------------
def assign_player(account_id: int):
    # Vérifier si déjà dans une instance
    inst = r.get(f"player:{account_id}")
    if inst:
        return int(inst)

    # Chercher une instance non pleine
    for inst_id in r.smembers("instances"):
        if r.scard(f"instance:{inst_id}:players") < MAX_PLAYERS:
            r.sadd(f"instance:{inst_id}:players", account_id)
            r.set(f"player:{account_id}", inst_id)
            return int(inst_id)

    # Sinon créer une nouvelle instance
    new_id = r.incr("instance_counter")
    r.sadd("instances", new_id)
    r.sadd(f"instance:{new_id}:players", account_id)
    r.set(f"player:{account_id}", new_id)
    return new_id

def remove_player(account_id: int):
    inst = r.get(f"player:{account_id}")
    if not inst:
        return None

    r.srem(f"instance:{inst}:players", account_id)
    r.delete(f"player:{account_id}")
    return int(inst)

def get_status():
    instances = []
    for inst_id in r.smembers("instances"):
        players = list(r.smembers(f"instance:{inst_id}:players"))

        # Récupérer les noms des personnages
        player_infos = []
        for p in players:
            char = db.db.execute(
                "SELECT name FROM characters WHERE account_id = ? LIMIT 1",
                [p]
            ).fetchone()

            player_infos.append({
                "account_id": int(p),
                "name": char[0] if char else "Inconnu"
            })

        instances.append({
            "instance_id": int(inst_id),
            "players": len(players),
            "player_ids": player_infos
        })

    return instances

# -----------------------------
# ENDPOINTS JOUEURS / INSTANCES
# -----------------------------
@app.post("/join_instance")
async def join_instance(account_id: int = Depends(get_current_account)):
    inst = assign_player(account_id)
    await broadcast_instances()
    return {"success": True, "instance_id": inst}

@app.post("/leave_instance")
async def leave_instance(account_id: int = Depends(get_current_account)):
    inst = remove_player(account_id)
    await broadcast_instances()
    return {"success": True, "instance_id": inst}

@app.get("/instances")
def list_instances():
    return {"success": True, "instances": get_status()}

@app.get("/instances_list")
def instances_list():
    return {"success": True, "instances": get_status()}

# -----------------------------
# PERSONNAGES
# -----------------------------
@app.get("/characters_list")
def characters_list(account_id: int = Depends(get_current_account)):
    chars = db.list_characters_for_account(account_id)

    return {
        "success": True,
        "characters": [
            {
                "id": c[0],
                "name": c[1],
                "level": c[2],
                "xp": c[3],
                "class": c[4],
                "appearance": json.loads(c[5])
            }
            for c in chars
        ]
    }

@app.websocket("/ws/game/{instance_id}/{character_id}")
async def game_ws(
    websocket: WebSocket,
    instance_id: int,
    character_id: int
):
    await websocket.accept()

    # Récupération du session_id envoyé par le client
    session_id = websocket.headers.get("Authorization").split(" ")[1]

    # Lancer le refresh automatique + détection session expirée
    asyncio.create_task(session_refresher(
        websocket,
        session_id,
        instance_id,
        character_id
    ))

    # Enregistrement connexion
    if instance_id not in remote_players_connections:
        remote_players_connections[instance_id] = []

    remote_players_connections[instance_id].append(websocket)

    try:
        # Récup personnage
        char = db.db.execute("""
            SELECT
                id,
                name,
                class,
                appearance,
                pos_x,
                pos_y
            FROM characters
            WHERE id = ?
        """, [character_id]).fetchone()

        if not char:
            await websocket.close()
            return

        if instance_id not in instance_players_state:
            instance_players_state[instance_id] = {}

        # Ajout état joueur
        instance_players_state[instance_id][character_id] = {
            "id": char[0],
            "name": char[1],
            "class": char[2],
            "appearance": json.loads(char[3]),
            "x": char[4],
            "y": char[5]
        }

        # Broadcast spawn
        payload = {
            "type": "players",
            "players": list(instance_players_state[instance_id].values())
        }

        for ws in remote_players_connections[instance_id]:
            try:
                await ws.send_text(json.dumps(payload))
            except:
                pass

        # Boucle principale
        while True:
            data = await websocket.receive_text()
            data = json.loads(data)

            if data["type"] == "move":
                x = data["x"]
                y = data["y"]

                # Update mémoire
                instance_players_state[instance_id][character_id]["x"] = x
                instance_players_state[instance_id][character_id]["y"] = y

                # Broadcast move
                payload = {
                    "type": "move",
                    "character_id": character_id,
                    "x": x,
                    "y": y
                }

                for ws in remote_players_connections[instance_id]:
                    try:
                        await ws.send_text(json.dumps(payload))
                    except:
                        pass

    except WebSocketDisconnect:
        pass

    finally:
        # Nettoyage connexion
        if websocket in remote_players_connections.get(instance_id, []):
            remote_players_connections[instance_id].remove(websocket)

        # Suppression joueur
        if instance_id in instance_players_state:
            if character_id in instance_players_state[instance_id]:
                del instance_players_state[instance_id][character_id]

        # Broadcast déconnexion
        payload = {
            "type": "disconnect",
            "character_id": character_id
        }

        for ws in remote_players_connections.get(instance_id, []):
            try:
                await ws.send_text(json.dumps(payload))
            except:
                pass
            
@app.post("/characters")
def create_character(payload: CharacterCreate, account_id: int = Depends(get_current_account)):
    name = payload.name.strip()

    if len(name) < 3:
        raise HTTPException(400, "Nom trop court")

    # Vérifie doublon nom
    existing = db.db.execute(
        "SELECT 1 FROM characters WHERE account_id = ? AND LOWER(name) = LOWER(?)",
        [account_id, name]
    ).fetchone()

    if existing:
        raise HTTPException(400, "Un personnage porte déjà ce nom.")

    # Vérifie classe
    if payload.char_class not in VALID_CLASSES:
        raise HTTPException(400, "Classe invalide")

    base = BASE_STATS[payload.char_class]

    # 🔥 1. génération ID (DuckDB safe)
    next_id = db.db.execute("""
        SELECT COALESCE(MAX(id), 0) + 1 FROM characters
    """).fetchone()[0]

    # 🔥 2. insert complet (AVEC id)
    db.db.execute("""
        INSERT INTO characters (
            id,
            account_id,
            name,
            level,
            xp,
            class,
            appearance,
            hp,
            mana,
            force,
            agilite,
            intelligence
        )
        VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?)
    """, [
        next_id,
        account_id,
        name,
        payload.char_class,
        json.dumps(payload.appearance),
        base["hp"],
        base["mana"],
        base["force"],
        base["agilite"],
        base["intelligence"]
    ])

    # 🔥 3. récupération safe
    char = db.db.execute("""
        SELECT *
        FROM characters
        WHERE id = ?
    """, [next_id]).fetchone()

    return {
        "success": True,
        "character": {
            "id": char[0],
            "account_id": char[1],
            "name": char[2],
            "level": char[3],
            "xp": char[4],
            "class": char[5],
            "appearance": json.loads(char[6]),
            "hp": char[7],
            "mana": char[8],
            "force": char[9],
            "agilite": char[10],
            "intelligence": char[11]
        }
    }
# ADMIN
# -----------------------------
@app.post("/admin/create_instance")
async def create_instance():
    new_id = r.incr("instance_counter")
    r.sadd("instances", new_id)
    await broadcast_instances()
    return {"success": True, "instance_id": new_id}

@app.post("/admin/clear_instance/{instance_id}")
async def clear_instance(instance_id: int):
    players = r.smembers(f"instance:{instance_id}:players")

    for p in players:
        r.delete(f"player:{p}")

    r.delete(f"instance:{instance_id}:players")

    await broadcast_instances()
    return {"success": True}

@app.post("/admin/delete_instance/{instance_id}")
async def delete_instance(instance_id: int):
    r.srem("instances", instance_id)
    r.delete(f"instance:{instance_id}:players")
    await broadcast_instances()
    return {"success": True}

# ============================
# ADMIN : Voir personnage
# ============================
@app.get("/admin/character_info/{account_id}")
def admin_character_info(account_id: int):
    char = db.db.execute(
        """
        SELECT name, class, appearance, level
        FROM characters
        WHERE account_id = ?
        LIMIT 1
        """,
        [account_id]
    ).fetchone()

    if not char:
        raise HTTPException(404, "Aucun personnage trouvé pour cet utilisateur.")

    return {
        "success": True,
        "name": char[0],
        "class": char[1],
        "appearance": json.loads(char[2]),
        "level": char[3]
    }


# ============================
# ADMIN : Kick joueur
# ============================
@app.post("/admin/kick_player/{instance_id}/{account_id}")
async def admin_kick_player(instance_id: int, account_id: int):
    r.srem(f"instance:{instance_id}:players", account_id)
    r.delete(f"player:{account_id}")
    await broadcast_instances()
    return {"success": True}

async def session_refresher(websocket, session_id, instance_id, character_id):
    while True:
        await asyncio.sleep(60)

        try:
            res = requests.get(
                f"{AUTH_URL}/validate_session",
                headers={"Authorization": f"Session {session_id}"}
            )

            # Session expirée → on ferme le WS
            if res.status_code == 401:
                await websocket.send_text(json.dumps({
                    "type": "session_expired"
                }))
                await websocket.close()
                return

            data = res.json()

            # Session rafraîchie
            if data.get("refreshed"):
                await websocket.send_text(json.dumps({
                    "type": "session_refreshed",
                    "expires_at": data["expires_at"]
                }))

        except:
            continue

# ============================
# ADMIN : Téléporter joueur
# ============================
@app.post("/admin/teleport_player/{instance_id}/{account_id}")
async def admin_teleport_player(instance_id: int, account_id: int):
    # Retirer de l'instance actuelle
    r.srem(f"instance:{instance_id}:players", account_id)

    # Réassigner automatiquement à une autre instance
    new_id = assign_player(account_id)

    await broadcast_instances()
    return {"success": True, "new_instance": new_id}

@app.websocket("/ws/chat/{instance_id}")
async def chat_ws(websocket: WebSocket, instance_id: int):
    await websocket.accept()

    if instance_id not in chat_connections:
        chat_connections[instance_id] = []
    chat_connections[instance_id].append(websocket)

    # Envoi de l'historique
    rows = db.db.execute("""
        SELECT sender_type, sender_id, content
        FROM chat_messages
        WHERE instance_id = ?
        ORDER BY id ASC
        LIMIT 50
    """, [instance_id]).fetchall()

    for sender_type, sender_id, content in rows:
        prefix = "[ADMIN]" if sender_type == "admin" else "[PLAYER]"
        try:
            await websocket.send_text(f"{prefix} {content}")
        except:
            pass

    try:
        while True:
            try:
                msg = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except:
                continue

            msg = msg.strip()
            if not msg:
                continue

            # 🔥 DuckDB : générer ID manuellement
            next_id = db.db.execute(
                "SELECT COALESCE(MAX(id), 0) + 1 FROM chat_messages"
            ).fetchone()[0]

            # Stockage DB
            db.db.execute("""
                INSERT INTO chat_messages (id, instance_id, sender_type, sender_id, content)
                VALUES (?, ?, 'player', NULL, ?)
            """, [next_id, instance_id, msg])

            # Envoi à l'expéditeur
            try:
                await websocket.send_text(f"[YOU] {msg}")
            except:
                pass

            # Envoi aux autres
            for ws in list(chat_connections.get(instance_id, [])):
                if ws is not websocket:
                    try:
                        await ws.send_text(f"[PLAYER] {msg}")
                    except:
                        chat_connections[instance_id].remove(ws)

    finally:
        chat_connections[instance_id].remove(websocket)



class PositionUpdate(BaseModel):
    char_id: int
    x: int
    y: int


@app.post("/character/update_position")
def update_position(
    payload: PositionUpdate,
    account_id: int = Depends(get_current_account)
):
    # sécurité : vérifier que le perso appartient au joueur
    char = db.db.execute("""
        SELECT id
        FROM characters
        WHERE id = ? AND account_id = ?
    """, [payload.char_id, account_id]).fetchone()

    if not char:
        raise HTTPException(403, "Unauthorized character")

    db.update_position(payload.char_id, payload.x, payload.y)

    return {"success": True}
@app.post("/admin/chat/{instance_id}")
async def admin_send_chat(instance_id: int, payload: dict = Body(...)):
    message = payload.get("message", "").strip()
    if not message:
        raise HTTPException(400, "Message vide")

    # 🔥 DuckDB : générer ID manuellement
    next_id = db.db.execute(
        "SELECT COALESCE(MAX(id), 0) + 1 FROM chat_messages"
    ).fetchone()[0]

    # Stockage DB
    db.db.execute("""
        INSERT INTO chat_messages (id, instance_id, sender_type, sender_id, content)
        VALUES (?, ?, 'admin', NULL, ?)
    """, [next_id, instance_id, message])

    # Cache Redis (optionnel)
    r.rpush(f"chat:{instance_id}", message)

    text = f"[ADMIN] {message}"

    # Diffusion temps réel
    for ws in list(chat_connections.get(instance_id, [])):
        try:
            await ws.send_text(text)
        except:
            chat_connections[instance_id].remove(ws)

    return {"success": True}
@app.get("/me/state")
def get_my_state(account_id: int = Depends(get_current_account)):

    # instance actuelle
    inst = r.get(f"player:{account_id}")

    if not inst:
        return {
            "in_instance": False
        }

    # personnage du compte
    char = db.db.execute("""
        SELECT
            id,
            name,
            class,
            appearance,
            level,
            pos_x,
            pos_y
        FROM characters
        WHERE account_id = ?
        LIMIT 1
    """, [account_id]).fetchone()

    if not char:
        return {
            "in_instance": False
        }

    return {
        "in_instance": True,

        "instance_id": int(inst),

        "character": {
            "id": char[0],
            "name": char[1],
            "class": char[2],
            "appearance": json.loads(char[3]),
            "level": char[4],
            "pos_x": char[5],
            "pos_y": char[6]
        }
    }
@app.get("/character/{id}")
def get_character(id: int, account_id: int = Depends(get_current_account)):
    char = db.db.execute("""
        SELECT name, class, level, xp, hp, mana, force, agilite, intelligence, pos_x, pos_y
        FROM characters
        WHERE id = ? AND account_id = ?
    """, [id, account_id]).fetchone()

    if not char:
        raise HTTPException(404, "Character not found")

    return {
        "name": char[0],
        "class": char[1],
        "level": char[2],
        "xp": char[3],
        "hp": char[4],
        "mana": char[5],
        "force": char[6],
        "agilite": char[7],
        "intelligence": char[8],

        "pos_x": char[9],
        "pos_y": char[10]
    }
    
@app.get("/instance/players/{instance_id}")
def get_instance_players(instance_id: int):
    players = r.smembers(f"instance:{instance_id}:players")

    result = []

    for p in players:
        char = db.db.execute("""
            SELECT id, name, class, appearance, pos_x, pos_y
            FROM characters
            WHERE account_id = ?
            LIMIT 1
        """, [p]).fetchone()

        if char:
            result.append({
                "account_id": int(p),
                "id": char[0],
                "name": char[1],
                "class": char[2],
                "appearance": json.loads(char[3]),
                "x": char[4] or 2,
                "y": char[5] or 2
            })

    return {"players": result}