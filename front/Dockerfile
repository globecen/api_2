FROM python:3.12-alpine

WORKDIR /app

# (optionnel) améliore les perfs de http.server
ENV PYTHONUNBUFFERED=1

# copie des fichiers (au lieu du volume en prod)
COPY . /app

EXPOSE 8080

CMD ["python", "-m", "http.server", "8080", "--bind", "0.0.0.0"]