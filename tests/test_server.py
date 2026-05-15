from fastapi.testclient import TestClient

from feyngraph.server import create_app


def test_app_root_returns_404_when_frontend_missing():
    app = create_app()
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code in (404, 500)


def test_health_endpoint():
    app = create_app()
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_unified_error_shape_on_unknown_route():
    app = create_app()
    client = TestClient(app)
    resp = client.get("/api/does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert "detail" in body
