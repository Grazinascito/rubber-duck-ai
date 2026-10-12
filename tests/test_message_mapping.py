"""T026 — unit tests for the Live API event → client envelope mapping."""

import base64

from google.genai import types

from gemini_live import session_messages_to_client


def audio_part(data: bytes) -> types.Part:
    return types.Part(inline_data=types.Blob(mime_type="audio/pcm", data=data))


def test_returns_an_interrupted_envelope_when_server_content_has_interrupted_true():
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(interrupted=True)
    )

    assert session_messages_to_client(message) == [{"type": "interrupted"}]


def test_returns_a_turn_complete_envelope_when_server_content_has_turn_complete_true():
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(turn_complete=True)
    )

    assert session_messages_to_client(message) == [{"type": "turn_complete"}]


def test_returns_one_gemini_envelope_with_base64_audio_for_each_audio_part_of_the_model_turn():
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(
            model_turn=types.Content(
                role="model",
                parts=[audio_part(b"abc"), audio_part(b"de")],
            )
        )
    )

    assert session_messages_to_client(message) == [
        {"type": "gemini", "payload": {"audio": base64.b64encode(b"abc").decode()}},
        {"type": "gemini", "payload": {"audio": base64.b64encode(b"de").decode()}},
    ]


def test_returns_a_gemini_envelope_with_text_from_output_audio_transcription():
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(
            output_transcription=types.Transcription(text="Quack!")
        )
    )

    assert session_messages_to_client(message) == [
        {"type": "gemini", "payload": {"text": "Quack!"}}
    ]


def test_returns_a_user_envelope_with_the_transcribed_input_audio():
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(
            input_transcription=types.Transcription(text="estou travada no cache")
        )
    )

    assert session_messages_to_client(message) == [
        {"type": "user", "payload": {"text": "estou travada no cache"}}
    ]


def test_marks_the_user_envelope_finished_when_the_input_transcription_is_finished():
    message = types.LiveServerMessage(
        server_content=types.LiveServerContent(
            input_transcription=types.Transcription(text="terminei de falar", finished=True)
        )
    )

    assert session_messages_to_client(message) == [
        {"type": "user", "payload": {"text": "terminei de falar", "finished": True}}
    ]


def test_returns_no_client_message_for_resumption_updates_go_away_or_empty_server_messages():
    resumption_update = types.LiveServerMessage(
        session_resumption_update=types.LiveServerSessionResumptionUpdate(
            resumable=True, new_handle="handle-1"
        )
    )
    go_away = types.LiveServerMessage(
        go_away=types.LiveServerGoAway(time_left="5s")
    )
    empty = types.LiveServerMessage()

    assert session_messages_to_client(resumption_update) == []
    assert session_messages_to_client(go_away) == []
    assert session_messages_to_client(empty) == []
