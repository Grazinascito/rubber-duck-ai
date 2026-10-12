"""Gemini Live connection, session config, and event → envelope mapping.

T029. The only module that knows about the google-genai SDK; main.py stays
Google-free and testable with stub sessions.
"""

import base64
import os

from google import genai
from google.genai import types

MODEL_ID = os.getenv("MODEL_ID", "gemini-3.8-live")
DUCK_VOICE = os.getenv("DUCK_VOICE", "Puck")
AUDIO_MIME_TYPE = "audio/pcm;rate=16000"

# US8 (T046) replaces this placeholder with duck_instruction.py.
DUCK_INSTRUCTION = (
    "Você é um pato de borracha que ajuda uma pessoa a estudar ouvindo a "
    "explicação dela. Responda sempre no idioma em que a pessoa falar com você, "
    "em frases curtas, curiosas e diretas. Nunca faça sons de pato (quack) nem "
    "onomatopeias: fale de forma natural. Responda apenas quando a pessoa falar "
    "com você."
)


def create_session_config(
    previous_handle: str | None = None,
) -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=DUCK_VOICE
                )
            )
        ),
        # Transcriptions drive the sleep timer (user) and future captions (duck).
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        # Keeps long sessions coherent by discarding old context (PRD E6).
        context_window_compression=types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow()
        ),
        session_resumption=(
            types.SessionResumptionConfig(handle=previous_handle)
            if previous_handle
            else None
        ),
        # safety_settings intentionally left at the default (do not relax).
        system_instruction=DUCK_INSTRUCTION,
    )


def connect_session(previous_handle: str | None = None):
    """Async context manager yielding a connected AsyncSession."""
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return client.aio.live.connect(
        model=MODEL_ID, config=create_session_config(previous_handle)
    )


async def send_audio(session, pcm_bytes: bytes) -> None:
    """Forward one 16 kHz Int16 PCM chunk to the session's realtime input."""
    await session.send_realtime_input(
        audio=types.Blob(mime_type=AUDIO_MIME_TYPE, data=pcm_bytes)
    )


def session_messages_to_client(message: types.LiveServerMessage) -> list[dict]:
    """Map one Live server message to zero or more client envelopes.

    Pure function: no I/O, tested directly (T026). Resumption updates and
    go-away notices are handled by the /ws loop and produce no envelope.
    """
    envelopes: list[dict] = []
    content = message.server_content
    if content is None:
        return envelopes

    if content.interrupted:
        envelopes.append({"type": "interrupted"})

    input_transcription = content.input_transcription
    if input_transcription is not None and input_transcription.text:
        payload = {"text": input_transcription.text}
        if input_transcription.finished is True:
            payload["finished"] = True
        envelopes.append({"type": "user", "payload": payload})

    output_transcription = content.output_transcription
    if output_transcription is not None and output_transcription.text:
        envelopes.append({"type": "gemini", "payload": {"text": output_transcription.text}})

    if content.model_turn is not None:
        for part in content.model_turn.parts or []:
            inline_data = part.inline_data
            if inline_data is not None and inline_data.data:
                audio_b64 = base64.b64encode(inline_data.data).decode("ascii")
                envelopes.append({"type": "gemini", "payload": {"audio": audio_b64}})

    # The renderer must enqueue the final PCM before deciding the turn drained.
    if content.turn_complete:
        envelopes.append({"type": "turn_complete"})

    return envelopes
