from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_echoes_back_a_valid_json_envelope_as_an_echo_message():
    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"type": "ping", "payload": {"n": 1}})

        assert websocket.receive_json() == {
            "type": "echo",
            "payload": {"type": "ping", "payload": {"n": 1}},
        }


def test_replies_with_an_error_message_and_keeps_the_connection_when_the_message_has_no_type_field():
    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"sem_type": True})

        assert websocket.receive_json() == {
            "type": "error",
            "payload": {"reason": "invalid_message"},
        }

        websocket.send_json({"type": "ping"})
        assert websocket.receive_json() == {
            "type": "echo",
            "payload": {"type": "ping"},
        }
