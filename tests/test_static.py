from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_serves_the_page_with_the_duck_avatar_and_the_control_pill():
    response = client.get("/")

    assert response.status_code == 200
    assert 'id="duck-avatar"' in response.text
    assert 'class="control-pill"' in response.text
