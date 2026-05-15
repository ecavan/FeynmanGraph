"""Tests for the /api/models/upload-ufo route.

Note on Symbolica + repeated load_model calls:
  ufo-model-loader's load_model() invokes Symbolica internally, and Symbolica's
  current mimalloc-based allocator segfaults when load_model() is called twice
  in the same Python process (mi_thread_init reinitialisation). To avoid this
  we keep ONE real end-to-end upload test (`test_upload_real_sm_ufo_tar_gz`)
  and mock load_model for the route-logic tests (error paths, archive safety,
  id validation, conflict handling, etc.).

  If/when that Symbolica bug is fixed upstream, the mocked tests can be
  rewritten as real-UFO tests.
"""

import io
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

    Used for tests that exercise the route's archive-handling code without
    actually invoking ufo-model-loader (which is mocked in those tests).
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
# One real end-to-end test (single per process — see note at top)
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
# Route-logic tests (mock load_model + export_model to avoid Symbolica)
# -------------------------------------------------------------------

@pytest.fixture
def mock_ufo_loader(monkeypatch, tmp_path):
    """Stub ufo_model_loader.commands.load_model + export_model.

    Writes a minimal feyngraph-shaped JSON to the path export_model is given,
    so the route's post-conversion step finds a valid file.
    """
    import json as _json

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

    def fake_load_model(input_model_path, restriction_name, simplify_model,
                       wrap_indices_in_lorentz_structures):
        return ("FAKE_MODEL", "FAKE_PARAM_CARD")

    def fake_export_model(model, input_param_card, output_model_path, **_kwargs):
        Path(output_model_path).write_text(_json.dumps(fake_ufo_json))
        return output_model_path

    import ufo_model_loader.commands as cmds
    monkeypatch.setattr(cmds, "load_model", fake_load_model)
    monkeypatch.setattr(cmds, "export_model", fake_export_model)


def test_upload_mocked_succeeds(client, mock_ufo_loader):
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
    # Build an archive that's a valid tar.gz but contains no particles.py.
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
    # Use a real tar.gz so we don't trip INVALID_ARCHIVE first
    archive = _make_fake_ufo_archive()
    resp = client.post(
        "/api/models/upload-ufo",
        files={"file": ("Mock.tar.gz", archive, "application/gzip")},
        data={"model_id": "bad id with spaces"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_MODEL_ID"


def test_upload_conflict_without_overwrite(client, mock_ufo_loader):
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
