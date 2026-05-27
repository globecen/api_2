$env:ENV="dev"; uvicorn server.auth.auth_server:app --port 3001
$env:ENV="dev"; uvicorn server.game.game_server:app --port 3000