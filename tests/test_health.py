from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_returns_200_and_status_ok_for_get_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
