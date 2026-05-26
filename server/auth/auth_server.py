from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from passlib.hash import argon2
import time, secrets
from fastapi.middleware.cors import CORSMiddleware
from model.AuthDatabase import AuthDatabase
import redis

# -----------------------------
# INITIALISATION
# -----------------------------
app = FastAPI()
@app.on_event("startup")
def startup_event():
    import subprocess

    if getattr(app.state, "db_initialized", False):
        return

    print("Init DB auth...")

    subprocess.run(["python", "init_auth_db.py"], check=True)

    app.state.db_initialized = True

    print("DB OK")
db = AuthDatabase("auth.db")

# Redis
r = redis.Redis(host="redis", port=6379, decode_responses=True)

SESSION_DURATION = 86400  # 24h

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# MODELES
# -----------------------------
class Register(BaseModel):
    username: str
    password: str

class Login(BaseModel):
    username: str
    password: str

# -----------------------------
# OUTILS
# -----------------------------
def hash_password(p: str):
    return argon2.hash(p)

def verify_password(p: str, h: str):
    return argon2.verify(p, h)

def create_session(account_id: int):
    session_id = secrets.token_hex(32)
    expires = int(time.time()) + SESSION_DURATION

    r.hset(f"session:{session_id}", mapping={
        "account_id": account_id,
        "expires_at": expires
    })
    r.expire(f"session:{session_id}", SESSION_DURATION)

    return session_id, expires

# -----------------------------
# ENDPOINTS
# -----------------------------
@app.post("/register")
def register(payload: Register):
    existing = db.get_account_by_username(payload.username)

    if existing:
        if verify_password(payload.password, existing[2]):
            raise HTTPException(400, "Compte déjà existant.")
        else:
            raise HTTPException(400, "Nom déjà pris.")

    hashed = hash_password(payload.password)
    account_id = db.create_account(payload.username, hashed)
    return {"success": True, "account_id": account_id}

@app.post("/login")
def login(payload: Login):
    row = db.get_account_by_username(payload.username)

    if not row or not verify_password(payload.password, row[2]):
        raise HTTPException(400, "Identifiants invalides.")

    session_id, expires = create_session(row[0])
    return {"success": True, "session_id": session_id, "expires_at": expires}

@app.get("/validate_session")
def validate_session(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Session "):
        raise HTTPException(401, "Session invalide.")

    session_id = authorization.split(" ")[1]

    data = r.hgetall(f"session:{session_id}")
    if not data:
        raise HTTPException(401, "Session invalide.")

    if int(data["expires_at"]) < int(time.time()):
        raise HTTPException(401, "Session expirée.")

    return {"success": True, "account_id": int(data["account_id"])}
