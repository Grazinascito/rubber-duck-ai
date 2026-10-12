from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"

CSP_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "media-src 'self'; "
    "connect-src 'self' ws://127.0.0.1:8000; "
    "worker-src 'self'"
)

app = FastAPI()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def is_envelope(message: object) -> bool:
    return isinstance(message, dict) and isinstance(message.get("type"), str)


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            try:
                message = await websocket.receive_json()
            except ValueError:
                await websocket.send_json(
                    {"type": "error", "payload": {"reason": "invalid_message"}}
                )
                continue

            if is_envelope(message):
                await websocket.send_json({"type": "echo", "payload": message})
            else:
                await websocket.send_json(
                    {"type": "error", "payload": {"reason": "invalid_message"}}
                )
    except WebSocketDisconnect:
        pass


@app.middleware("http")
async def csp_header(request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = CSP_POLICY
    return response


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
