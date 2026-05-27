import os

ENV = os.getenv("ENV", "dev")

if ENV == "prod":
    AUTH_URL = "http://85.69.92.4:3001"
    URL_REDIS = "redis"
else:
    AUTH_URL = "http://127.0.0.1:3001"
    URL_REDIS = "127.0.0.1"