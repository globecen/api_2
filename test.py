import requests

AUTH = "http://127.0.0.1:3001"
GAME = "http://127.0.0.1:3000"

# 🔐 1. LOGIN (pour récupérer une session valide)
login = requests.post(f"{AUTH}/login", json={
    "username": "tata",
    "password": "tata"
})

if login.status_code != 200:
    print("Login failed:", login.text)
    exit()

session_id = login.json()["session_id"]

headers = {
    "Authorization": "Session " + session_id
}

# 🧠 2. TEST CHARACTER ROUTE
character_id = 3  # change ici

res = requests.get(f"{GAME}/character/{character_id}", headers=headers)

print("Status:", res.status_code)
print("Response:")
print(res.json())