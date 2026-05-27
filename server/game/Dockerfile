FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV ENV=prod

# dépendances système
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# install Python deps
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# copie du code
COPY . /app

EXPOSE 3000

# lancement serveur
CMD ["uvicorn", "game_server:app", "--host", "0.0.0.0", "--port", "3000"]