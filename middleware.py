from fastapi import Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger("server")


async def db_error_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        msg = str(e).lower()

        if "unique" in msg or "constraint" in msg:
            logger.warning(f"Contrainte violée: {e}")
            return JSONResponse(
                status_code=400,
                content={"detail": "Contrainte de données violée."}
            )

        logger.error(f"Erreur interne: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": "Erreur interne du serveur."}
        )