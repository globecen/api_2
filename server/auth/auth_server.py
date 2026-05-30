from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from passlib.hash import argon2
import time, secrets
from fastapi.middleware.cors import CORSMiddleware
from .AuthDatabase import AuthDatabase
from .init_auth_db import init_auth_db
from .settings import AUTH_URL, URL_REDIS
#from AuthDatabase import AuthDatabase
#from init_auth_db import init_auth_db
#from settings import AUTH_URL, URL_REDIS
import redis
# -----------------------------
# INITIALISATION
# -----------------------------
app = FastAPI()
init_auth_db()
r = redis.Redis(host=URL_REDIS, port=6379, decode_responses=True)
    
db = AuthDatabase("auth.db")

# Redis

SESSION_DURATION = 3600  # 10 secondes
REFRESH_THRESHOLD = 3600  # 5 secondes

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
    key = f"session:{session_id}"

    data = r.hgetall(key)
    if not data:
        raise HTTPException(401, "Session invalide.")

    now = int(time.time())
    expires_at = int(data["expires_at"])

    # --- SESSION EXPIRÉE → NETTOYAGE ---
    if expires_at < now:
        r.delete(key)  # suppression propre dans Redis
        raise HTTPException(401, "Session expirée.")

    # --- REFRESH AUTOMATIQUE ---
    remaining = expires_at - now

    if remaining < REFRESH_THRESHOLD:
        new_expires = now + SESSION_DURATION
        r.hset(key, "expires_at", new_expires)
        r.expire(key, SESSION_DURATION)

        return {
            "success": True,
            "account_id": int(data["account_id"]),
            "refreshed": True,
            "expires_at": new_expires
        }

    return {
        "success": True,
        "account_id": int(data["account_id"]),
        "refreshed": False,
        "expires_at": expires_at
    }
