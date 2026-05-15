from pathlib import Path

import pytest

from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def test_load_from_json_fixture():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    m = loader.load_model("sm_minimal")
    assert m.id == "sm_minimal"
    assert any(p.pdg_id == 22 for p in m.particles)
    assert any(v.id == "V_QED_eea" for v in m.vertices)


def test_load_unknown_model_raises():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    with pytest.raises(ModelNotFoundError):
        loader.load_model("not_a_real_model")


def test_list_models_includes_fixture():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    metas = loader.list_models()
    ids = {m.id for m in metas}
    assert "sm_minimal" in ids


def test_model_is_cached():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    a = loader.load_model("sm_minimal")
    b = loader.load_model("sm_minimal")
    assert a is b
