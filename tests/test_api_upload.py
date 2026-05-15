"""Tests for the /api/models/upload-ufo route.

The upload route invokes ufo-model-loader in a subprocess via
`feyngraph.api.upload._invoke_ufo_loader` (subprocess isolation works around
Symbolica's mimalloc bug — see feyngraph/_ufo_subprocess.py).

Tests:
- One real end-to-end test runs the actual subprocess against the gammaloop SM UFO.
- Route-logic tests stub `_invoke_ufo_loader` so they don't pay subprocess cost
  AND can simulate specific loader-failure modes without needing a real
  malformed UFO.
"""

import io
import json
import tarfile
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from feyngraph.server import create_app

GAMMALOOP_SM_UFO = Path.home() / "Documents" / "GitHub" / "gammaloop" / "assets" / "models" / "ufo" / "sm"


def _make_tar_gz_from_dir(d: Path, archive_root: str | None = None) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for path in sorted(d.rglob("*")):
            if path.is_file():
                arcname = (
                    Path(archive_root) / path.relative_to(d)
                    if archive_root
                    else path.relative_to(d)
                )
                tf.add(path, arcname=str(arcname))
    return buf.getvalue()


def _make_fake_ufo_archive(*, with_particles_py: bool = True) -> bytes:
    """A minimal tar.gz that LOOKS like a UFO layout (has particles.py at root).

    The route uses the archive's particles.py only to locate the UFO root; the
    actual loader is stubbed in these tests, so the file's contents are unused.
    """
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        if with_particles_py:
            payload = b"# fake UFO particles.py for testing\n"
            info = tarfile.TarInfo("particles.py")
            info.size = len(payload)
            tf.addfile(info, io.BytesIO(payload))
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _isolate_user_models(monkeypatch, tmp_path):
    monkeypatch.setenv("FEYNGRAPH_USER_MODELS_DIR", str(tmp_path / "user_models"))


@pytest.fixture
def client():
    return TestClient(create_app())


# -------------------------------------------------------------------
# One real end-to-end test (spawns a real subprocess)
# -------------------------------------------------------------------

@pytest.mark.skipif(not GAMMALOOP_SM_UFO.is_dir(), reason="gammaloop SM UFO not available")
def test_upload_real_sm_ufo_end_to_end(client):
    archive = _make_tar_gz_from_dir(GAMMALOOP_SM_UFO, archive_root="MySM")
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("MySM.tar.gz", archive, "application/gzip")},
        data={"model_id": "mysm_upload"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == "mysm_upload"
    assert body["particles"] >= 17, body
    assert body["vertices"] >= 40, body

    list_resp = client.get("/api/models")
    ids = {m["id"] for m in list_resp.json()}
    assert "mysm_upload" in ids

    get_resp = client.get("/api/models/mysm_upload")
    assert get_resp.status_code == 200
    assert any(p["pdg_id"] == 22 for p in get_resp.json()["particles"])


# -------------------------------------------------------------------
# Route-logic tests (stub _invoke_ufo_loader to skip the subprocess)
# -------------------------------------------------------------------

@pytest.fixture
def stub_ufo_loader(monkeypatch):
    """Replace _invoke_ufo_loader with a stub that writes a minimal valid JSON
    to its output_path. Lets route-logic tests skip subprocess spawning."""
    fake_ufo_json = {
        "name": "MockSM",
        "particles": [
            {
                "pdg_code": 22, "name": "a", "antiname": "a", "spin": 3, "color": 1,
                "mass": "ZERO", "width": "ZERO", "charge": 0.0,
                "lepton_number": 0, "ghost_number": 0, "y_charge": 0,
                "texname": "a", "antitexname": "a",
            },
            {
                "pdg_code": 11, "name": "e-", "antiname": "e+", "spin": 2, "color": 1,
                "mass": "Me", "width": "ZERO", "charge": -1.0,
                "lepton_number": 1, "ghost_number": 0, "y_charge": -1,
                "texname": "e-", "antitexname": "e+",
            },
        ],
        "vertex_rules": [
            {"name": "V_FAKE", "particles": ["a", "e-", "e+"],
             "color_structures": ["1"], "lorentz_structures": ["FFV1"],
             "couplings": [["GC_X"]]},
        ],
    }

    def fake_invoke(*, ufo_root, output_path, restriction_name):
        output_path.write_text(json.dumps(fake_ufo_json))

    from feyngraph.api import upload as upload_mod
    monkeypatch.setattr(upload_mod, "_invoke_ufo_loader", fake_invoke)


def test_upload_stubbed_succeeds(client, stub_ufo_loader):
    archive = _make_fake_ufo_archive()
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", archive, "application/gzip")},
        data={"model_id": "mocksm"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["particles"] == 2
    assert body["vertices"] == 1


def test_upload_rejects_non_archive(client):
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("oops.txt", b"not an archive", "text/plain")},
        data={"model_id": "test_bad"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_ARCHIVE"


def test_upload_rejects_archive_without_particles_py(client):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        info = tarfile.TarInfo("README.md")
        body = b"not a UFO model"
        info.size = len(body)
        tf.addfile(info, io.BytesIO(body))
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("empty.tar.gz", buf.getvalue(), "application/gzip")},
        data={"model_id": "test_empty"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "UFO_LAYOUT_INVALID"


def test_upload_rejects_bad_model_id(client):
    archive = _make_fake_ufo_archive()
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", archive, "application/gzip")},
        data={"model_id": "bad id with spaces"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_MODEL_ID"


def test_upload_conflict_without_overwrite(client, stub_ufo_loader):
    archive = _make_fake_ufo_archive()
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", archive, "application/gzip")},
        data={"model_id": "dup_test"},
    )
    assert resp.status_code == 200

    resp2 = client.post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", archive, "application/gzip")},
        data={"model_id": "dup_test"},
    )
    assert resp2.status_code == 409
    assert resp2.json()["code"] == "MODEL_ALREADY_EXISTS"

    resp3 = client.post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", archive, "application/gzip")},
        data={"model_id": "dup_test", "overwrite": "true"},
    )
    assert resp3.status_code == 200


def test_upload_rejects_unsafe_zip_path(client):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w") as zf:
        zf.writestr("../escape.py", "import os; os.system('rm -rf /')")
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("evil.zip", buf.getvalue(), "application/zip")},
        data={"model_id": "evil"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "UNSAFE_ARCHIVE_PATH"


def test_upload_surfaces_subprocess_failure(client, monkeypatch):
    """If the subprocess returns nonzero, the route returns 422 UFO_LOAD_FAILED."""
    def fake_invoke(*, ufo_root, output_path, restriction_name):
        from feyngraph.api.errors import FeyngraphHTTPException
        raise FeyngraphHTTPException(
            status_code=422,
            detail="UFO model load failed: simulated stderr",
            code="UFO_LOAD_FAILED",
        )
    from feyngraph.api import upload as upload_mod
    monkeypatch.setattr(upload_mod, "_invoke_ufo_loader", fake_invoke)

    archive = _make_fake_ufo_archive()
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", archive, "application/gzip")},
        data={"model_id": "willfail"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "UFO_LOAD_FAILED"
