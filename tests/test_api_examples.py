from fastapi.testclient import TestClient

from feyngraph.server import create_app


def test_list_examples_returns_three_starters():
    client = TestClient(create_app())
    resp = client.get("/api/examples")
    assert resp.status_code == 200
    ids = {ex["id"] for ex in resp.json()}
    assert ids == {"ee_mumu", "qq_tt", "gg_H"}


def test_get_example_ee_mumu():
    client = TestClient(create_app())
    resp = client.get("/api/examples/ee_mumu")
    assert resp.status_code == 200
    body = resp.json()
    assert body["process_name"] == "ee_mumu"
    assert body["model_id"] == "sm"
    assert len(body["edges"]) == 5


def test_get_unknown_example_404():
    client = TestClient(create_app())
    resp = client.get("/api/examples/nonexistent")
    assert resp.status_code == 404
    assert resp.json()["code"] == "EXAMPLE_NOT_FOUND"
