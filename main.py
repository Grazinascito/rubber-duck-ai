import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from gemini_live import (
    connect_session,
    send_audio,
    session_messages_to_client,
)

logger = logging.getLogger("rubber-duck.ws")

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


def should_sleep(
    last_utterance: float, now: float, timeout_seconds: float
) -> bool:
    """Pure sleep decision (T028): silence elapsed since the last user utterance."""
    return now - last_utterance >= timeout_seconds


async def _safe_send_json(websocket: WebSocket, envelope: dict) -> None:
    try:
        await websocket.send_json(envelope)
    except Exception:
        pass  # the client is already gone


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    timeout_seconds = float(os.getenv("SLEEP_AFTER_SECONDS", "80"))
    loop = asyncio.get_running_loop()
    last_utterance = loop.time()
    # Decision #11: an explicit mute pauses the sleep watchdog for the whole
    # connection (it survives the single go-away reconnect below).
    muted = False
    saved_handle: str | None = None
    logger.info("ws conectado (sleep timeout %.1fs)", timeout_seconds)

    try:
        go_away_reconnects = 0
        while True:
            async with connect_session(saved_handle) as session:
                # The duck never initiates (PRD P6, without the greeting
                # exception): the session opens listening only.

                end_reason: str | None = None
                go_away_seen = False
                audio_frames = 0

                async def pump_from_session() -> None:
                    nonlocal end_reason, go_away_seen, saved_handle, last_utterance
                    try:
                        while True:
                            async for message in session.receive():
                                update = message.session_resumption_update
                                if update is not None and update.resumable and update.new_handle:
                                    saved_handle = update.new_handle
                                if message.go_away is not None:
                                    go_away_seen = True
                                content = message.server_content
                                if (
                                    content is not None
                                    and content.input_transcription is not None
                                ):
                                    # Empty text (ASR failure, e.g. noisy room)
                                    # still proves the server is hearing the
                                    # user; it must not count as silence for
                                    # the sleep timer.
                                    last_utterance = loop.time()
                                for envelope in session_messages_to_client(message):
                                    await websocket.send_json(envelope)
                            # SDK 2.29 contract: receive() ends at EVERY
                            # interaction boundary (turn_complete) while the
                            # session stays open — listen for the next turn.
                    except Exception:
                        # Only a raised error means the connection died. With
                        # go_away already seen this is the announced drop (one
                        # resumption allowed); otherwise the session is lost.
                        end_reason = "session_ended"

                async def pump_from_client() -> None:
                    nonlocal audio_frames, muted, last_utterance
                    while True:
                        packet = await websocket.receive()
                        data = packet.get("bytes")
                        if data is not None:
                            audio_frames += 1
                            if audio_frames == 1:
                                logger.info("primeiro frame de áudio: %d bytes", len(data))
                            await send_audio(session, data)
                            continue

                        if packet.get("text") is not None:
                            try:
                                envelope = json.loads(packet["text"])
                            except ValueError:
                                envelope = None
                            payload = (
                                envelope.get("payload")
                                if isinstance(envelope, dict)
                                else None
                            )
                            if (
                                isinstance(envelope, dict)
                                and envelope.get("type") == "muted"
                                and isinstance(payload, dict)
                                and isinstance(payload.get("value"), bool)
                            ):
                                muted = payload["value"]
                                if not muted:
                                    # Unmuting resumes the conversation in
                                    # the same session: the inactivity clock
                                    # restarts, so the duck does not sleep
                                    # the instant the mic returns.
                                    last_utterance = loop.time()
                                logger.info("cliente mutado: %s", muted)
                                continue
                            await _safe_send_json(
                                websocket,
                                {"type": "error", "payload": {"reason": "invalid_message"}},
                            )

                async def sleep_watchdog() -> None:
                    nonlocal end_reason
                    interval = min(5.0, max(timeout_seconds / 10.0, 0.05))
                    while True:
                        await asyncio.sleep(interval)
                        # Decision #11: sleep only fires for inactivity with
                        # the mic on; an explicit mute keeps the session alive.
                        if not muted and should_sleep(
                            last_utterance, loop.time(), timeout_seconds
                        ):
                            end_reason = "sleep"
                            await _safe_send_json(websocket, {"type": "sleep"})
                            return

                tasks = [
                    asyncio.create_task(pump_from_session()),
                    asyncio.create_task(pump_from_client()),
                    asyncio.create_task(sleep_watchdog()),
                ]
                done, pending = await asyncio.wait(
                    tasks, return_when=asyncio.FIRST_COMPLETED
                )
                for task in pending:
                    task.cancel()
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)
                for task in done:
                    task.result()
                logger.info(
                    "loop da sessão terminou: %s (go_away=%s, reconexões=%d, frames de áudio=%d)",
                    end_reason,
                    go_away_seen,
                    go_away_reconnects,
                    audio_frames,
                )

            if end_reason == "sleep":
                break
            if (
                end_reason == "session_ended"
                and go_away_seen
                and go_away_reconnects < 1
            ):
                # Single reconnect with the stored handle.
                go_away_reconnects += 1
                continue
            if end_reason == "session_ended":
                await _safe_send_json(
                    websocket, {"type": "error", "payload": {"reason": "session_lost"}}
                )
            break
    except WebSocketDisconnect:
        logger.info("ws desconectado pelo cliente")
    except Exception:
        logger.exception("sessão falhou")
        await _safe_send_json(
            websocket, {"type": "error", "payload": {"reason": "session_failed"}}
        )
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.middleware("http")
async def csp_header(request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = CSP_POLICY
    return response


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(name)s: %(message)s")
    if not os.getenv("GEMINI_API_KEY"):
        sys.exit(
            "GEMINI_API_KEY ausente: copie .env.example para .env e informe a chave."
        )
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
