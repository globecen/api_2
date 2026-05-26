FROM python:3.12-slim

WORKDIR /app

# éviter les soucis de logs bufferisés
ENV PYTHONUNBUFFERED=1

# dépendances système (argon2 parfois utile)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# installer dépendances Python
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# copier le code
COPY . /app

EXPOSE 3001

# lancement du serveur
CMD ["uvicorn", "auth_server:app", "--host", "0.0.0.0", "--port", "3001"]