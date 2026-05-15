from fastapi.testclient import TestClient

from feyngraph.server import create_app


def test_list_theories():
    client = TestClient(create_app())
    resp = client.get("/api/theories")
    assert resp.status_code == 200
    ids = {t["id"] for t in resp.json()}
    assert ids == {"qed", "qcd", "sm"}
