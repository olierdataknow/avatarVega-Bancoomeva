import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Cargar el archivo .env ANTES de importar módulos propios: app.tools importa
# app.services, que lee variables de entorno al momento de cargarse.
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.rtmt import RTMiddleTier
from app.prompts import system_prompt
from app.tools import weather_tool, show_map_tool , azure_hybrid_search_tool
from fastapi.responses import HTMLResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-fastapi")


# ── Variables de entorno obligatorias ──────────────────────────────────────────
OPENAI_ENDPOINT   = os.getenv('OPENAI_ENDPOINT')
OPENAI_DEPLOYMENT = os.getenv('OPENAI_DEPLOYMENT')
OPENAI_API_KEY    = os.getenv('OPENAI_API_KEY')
# Deployment del modelo de transcripcion (lo que dice el usuario por voz).
OPENAI_TRANSCRIBE_DEPLOYMENT = os.getenv('OPENAI_TRANSCRIBE_DEPLOYMENT', 'gpt-4o-transcribe-diarize')

if not all([OPENAI_ENDPOINT, OPENAI_DEPLOYMENT, OPENAI_API_KEY]):
    raise RuntimeError(
        "Define OPENAI_ENDPOINT, OPENAI_DEPLOYMENT y OPENAI_API_KEY (p. ej. en un .env)"
    )

# ── Singleton del middle-tier que hace el puente con OpenAI ───────────────────
rtmt = RTMiddleTier(
    endpoint=OPENAI_ENDPOINT,
    deployment=OPENAI_DEPLOYMENT,
    api_key=OPENAI_API_KEY,
    system_prompt=system_prompt,
    transcribe_deployment=OPENAI_TRANSCRIBE_DEPLOYMENT,
)

rtmt.add_tool(azure_hybrid_search_tool)
# rtmt.add_tool(weather_tool)

# ── FastAPI ────────────────────────────────────────────────────────────────────
app = FastAPI(title="Realtime-Voice-Demo")
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

app = FastAPI()

frontend_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"

@app.get("/{full_path:path}")
async def serve_static(full_path: str):
    file_path = frontend_dir / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    # fallback: index.html (para SPA / React Router)
    return FileResponse(frontend_dir / "index.html")

# Servir index.html en la raíz
@app.get("/")
async def serve_react():
    return HTMLResponse((frontend_dir / "index.html").read_text(encoding="utf-8"))

# ▶ WebSocket principal
@app.websocket("/realtime")
async def realtime_ws(ws: WebSocket):
    await ws.accept()
    try:
        await rtmt.forward_messages(ws)
    except WebSocketDisconnect:
        logger.info("Cliente desconectado (WebSocketDisconnect)")
    except Exception as e:
        logger.error("Error inesperado en realtime_ws: %s", e)
