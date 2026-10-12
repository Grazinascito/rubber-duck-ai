from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_serves_the_page_with_the_connection_status_marker_in_desconectado_state():
    response = client.get("/")

    assert response.status_code == 200
    assert 'data-testid="connection-status"' in response.text
    assert "desconectado" in response.text
