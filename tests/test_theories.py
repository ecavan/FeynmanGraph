from pathlib import Path

from feyngraph.domain.model_loader import ModelLoader
from feyngraph.domain.theories import (
    THEORY_QCD,
    THEORY_QED,
    THEORY_SM,
    apply_theory,
    list_theories,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def test_list_theories_has_three_v01_theories():
    ids = {t.id for t in list_theories()}
    assert ids == {"qed", "qcd", "sm"}


def test_qed_filter_drops_non_qed_vertices():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    sm = loader.load_model("sm_minimal")
    filtered = apply_theory(sm, THEORY_QED)
    qed_pdgs = {22, 11, -11, 13, -13, 15, -15}
    for v in filtered.vertices:
        assert set(v.particles).issubset(qed_pdgs)


def test_qcd_filter_drops_qed_only_vertices():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    sm = loader.load_model("sm_minimal")
    filtered = apply_theory(sm, THEORY_QCD)
    assert filtered.vertices == []


def test_sm_filter_is_identity():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    sm = loader.load_model("sm_minimal")
    filtered = apply_theory(sm, THEORY_SM)
    assert filtered.particles == sm.particles
    assert filtered.vertices == sm.vertices
