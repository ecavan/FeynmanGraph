from fastapi.testclient import TestClient

from feyngraph.server import create_app


def test_app_root_responds():
    """`/` either serves the React bundle (after `npm run build`) or 404s
    (in a fresh checkout). Both are valid; just verify the server doesn't 500.
    """
    app = create_app()
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code in (200, 404)


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
