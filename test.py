import requests
import random
import string
import time

AUTH = "http://127.0.0.1:3001"
GAME = "http://127.0.0.1:3000"

INSTANCE_ID = 1  # change si besoin

def random_string(n=8):
    return ''.join(random.choices(string.ascii_lowercase, k=n))

def create_account():
    username = "user_" + random_string()
    password = "pass123+"+ random_string()

    r = requests.post(f"{AUTH}/register", json={
        "username": username,
        "password": password
    })

    if r.status_code != 200:
        print("register failed", r.text)
        return None

    print("✔ account:", username)
    return username, password


def login(username, password):
    r = requests.post(f"{AUTH}/login", json={
        "username": username,
        "password": password
    })

    if r.status_code != 200:
        print("login failed")
        return None

    return r.json()["session_id"]


def create_character(session):
    headers = {"Authorization": "Session " + session}

    name = "char_" + random_string()
    classes = ["Guerrier", "Mage", "Archer", "Nécromancien"]

    payload = {
        "name": name,
        "char_class": random.choice(classes),
        "appearance": {
            "color": "#%06x" % random.randint(0, 0xFFFFFF)
        }
    }

    r = requests.post(f"{GAME}/characters", json=payload, headers=headers)

    if r.status_code != 200:
        print("character failed", r.text)
        return None

    print("🎮 character:", name)
    return r.json() if r.headers.get("content-type","").startswith("application/json") else True


def join_instance(session):
    headers = {"Authorization": "Session " + session}

    r = requests.post(f"{GAME}/join_instance", json={
        "instance_id": INSTANCE_ID
    }, headers=headers)

    if r.status_code != 200:
        print("join failed", r.text)
        return False

    print("➡ joined instance", INSTANCE_ID)
    return True


def run_bot():
    acc = create_account()
    if not acc:
        return

    username, password = acc

    session = login(username, password)
    if not session:
        return

    time.sleep(0.2)

    create_character(session)
    time.sleep(0.2)

    join_instance(session)


if __name__ == "__main__":
    for i in range(50):
        print(f"\n=== BOT {i+1}/50 ===")
        run_bot()
        time.sleep(0.1)