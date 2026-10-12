"""T027 — integration tests for /ws with a stubbed Gemini Live session."""

import asyncio
import time

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from google.genai import types

import main
from gemini_live import SUMMON_MARKER


def audio_part(data: bytes) -> types.Part:
    return types.Part(inline_data=types.Blob(mime_type="audio/pcm", data=data))


class StubSession:
    """Async-CM stand-in for the google-genai AsyncSession.

    Models the SDK 2.29 contract: receive() ends at each interaction
    boundary (turn_complete). With hold_open=True the "connection" then
    blocks waiting for the next interaction (session alive); with
    hold_open=False it dies (raises), like a dropped connection.
    """

    def __init__(self, script=None, hold_open=True):
        self._script = list(script or [])
        self._hold_open = hold_open
        self.sent_audio = []
        self.client_content_calls = []
        self.received_handle = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def receive(self):
        script, self._script = self._script, []
        for message in script:
            yield message
        if self._hold_open:
            await asyncio.Event().wait()
        raise ConnectionError("stub: connection closed")

    async def send_realtime_input(self, *, audio=None, **_kwargs):
        if audio is not None:
            self.sent_audio.append(bytes(audio.data))

    async def send_client_content(self, *, turns=None, turn_complete=True):
        self.client_content_calls.append({"turns": turns, "turn_complete": turn_complete})


class StubConnect:
    """Replaces gemini_live.connect_session; records resumption handles."""

    def __init__(self, sessions):
        self.sessions = list(sessions)
        self.handles = []

    def __call__(self, previous_handle=None):
        self.handles.append(previous_handle)
        session = self.sessions.pop(0)
        session.received_handle = previous_handle
        return session


def wait_until(condition, timeout_s=3.0):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.05)
    return condition()


@pytest.fixture()
def client():
    return TestClient(main.app)


def test_sends_the_summon_marker_as_client_content_right_after_the_websocket_connects(
    client, monkeypatch
):
    stub = StubSession(hold_open=True)
    monkeypatch.setattr(main, "connect_session", StubConnect([stub]))

    with client.websocket_connect("/ws") as websocket:
        assert wait_until(lambda: len(stub.client_content_calls) == 1)

    assert stub.client_content_calls == [
        {
            "turns": [{"role": "user", "parts": [{"text": SUMMON_MARKER}]}],
            "turn_complete": True,
        }
    ]


def test_forwards_binary_audio_frames_from_the_websocket_to_the_gemini_session(
    client, monkeypatch
):
    stub = StubSession(hold_open=True)
    monkeypatch.setattr(main, "connect_session", StubConnect([stub]))

    with client.websocket_connect("/ws") as websocket:
        assert wait_until(lambda: len(stub.client_content_calls) == 1)
        websocket.send_bytes(b"\x01\x02\x03")
        assert wait_until(lambda: stub.sent_audio == [b"\x01\x02\x03"])


def test_sends_mapped_envelopes_from_session_events_to_the_websocket(client, monkeypatch):
    stub = StubSession(
        script=[
            types.LiveServerMessage(
                server_content=types.LiveServerContent(
                    model_turn=types.Content(role="model", parts=[audio_part(b"abc")])
                )
            ),
            types.LiveServerMessage(
                server_content=types.LiveServerContent(interrupted=True)
            ),
        ],
        hold_open=True,
    )
    monkeypatch.setattr(main, "connect_session", StubConnect([stub]))

    with client.websocket_connect("/ws") as websocket:
        envelopes = [websocket.receive_json(), websocket.receive_json()]

    assert envelopes == [
        {"type": "gemini", "payload": {"audio": "YWJj"}},
        {"type": "interrupted"},
    ]


def test_keeps_the_connection_open_when_input_transcription_arrives(client, monkeypatch):
    monkeypatch.setenv("SLEEP_AFTER_SECONDS", "10000")
    stub = StubSession(
        script=[
            types.LiveServerMessage(
                server_content=types.LiveServerContent(
                    input_transcription=types.Transcription(text="estou travada")
                )
            ),
        ],
        hold_open=True,
    )
    monkeypatch.setattr(main, "connect_session", StubConnect([stub]))

    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json() == {
            "type": "user",
            "payload": {"text": "estou travada"},
        }
        websocket.send_bytes(b"\x04\x05")
        assert wait_until(lambda: stub.sent_audio == [b"\x04\x05"])


def test_sends_a_sleep_envelope_and_closes_when_no_utterance_happens_within_the_timeout(
    client, monkeypatch
):
    monkeypatch.setenv("SLEEP_AFTER_SECONDS", "0.3")
    stub = StubSession(hold_open=True)
    monkeypatch.setattr(main, "connect_session", StubConnect([stub]))

    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json() == {"type": "sleep"}
        with pytest.raises(WebSocketDisconnect):
            websocket.receive_json()


def test_resets_the_sleep_timer_when_an_empty_transcription_arrives(client, monkeypatch):
    monkeypatch.setenv("SLEEP_AFTER_SECONDS", "1.2")

    class EmptyTranscriptionSession(StubSession):
        async def receive(self):
            await asyncio.sleep(0.5)
            yield types.LiveServerMessage(
                server_content=types.LiveServerContent(
                    input_transcription=types.Transcription(text="")
                )
            )
            await asyncio.Event().wait()

    monkeypatch.setattr(
        main, "connect_session", StubConnect([EmptyTranscriptionSession()])
    )

    started = time.monotonic()
    with client.websocket_connect("/ws") as websocket:
        first = websocket.receive_json()
        elapsed = time.monotonic() - started

    assert first == {"type": "sleep"}
    # Without the reset the duck sleeps at ~1.2 s (the raw timeout), while the
    # user is talking; the transcription arriving at 0.5 s must push the sleep
    # to ~1.7 s instead.
    assert elapsed >= 1.45


def test_reconnects_once_with_the_stored_resumption_handle_after_go_away(
    client, monkeypatch
):
    first = StubSession(
        script=[
            types.LiveServerMessage(
                session_resumption_update=types.LiveServerSessionResumptionUpdate(
                    resumable=True, new_handle="handle-1"
                )
            ),
            types.LiveServerMessage(go_away=types.LiveServerGoAway(time_left="5s")),
        ],
        hold_open=False,  # connection drops right after the go-away notice
    )
    second = StubSession(
        script=[
            types.LiveServerMessage(
                server_content=types.LiveServerContent(
                    model_turn=types.Content(role="model", parts=[audio_part(b"xy")])
                )
            ),
        ],
        hold_open=True,
    )
    factory = StubConnect([first, second])
    monkeypatch.setattr(main, "connect_session", factory)

    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json() == {"type": "gemini", "payload": {"audio": "eHk="}}

    assert factory.handles == [None, "handle-1"]
    assert first.client_content_calls != []
    assert second.client_content_calls == []
