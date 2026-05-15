from pathlib import Path

from feyngraph.domain.legality import (
    PartialVertex,
    legal_completions,
)
from feyngraph.domain.model_loader import ModelLoader

FIXTURE_DIR = Path(__file__).parent / "fixtures"


def test_qed_vertex_complete_with_photon_for_ee():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    partial = PartialVertex(known_pdgs=[11, -11], unknown_count=1)
    options = legal_completions(partial, model)
    pdgs = {opt.pdg_id for opt in options}
    assert 22 in pdgs


def test_no_completion_for_nonsense():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    partial = PartialVertex(known_pdgs=[22, 22, 11], unknown_count=0)
    options = legal_completions(partial, model)
    assert options == []


def test_completion_dedupes_options():
    loader = ModelLoader(extra_search_dirs=[FIXTURE_DIR])
    model = loader.load_model("sm_minimal")
    partial = PartialVertex(known_pdgs=[11, -11], unknown_count=1)
    options = legal_completions(partial, model)
    pdgs = [opt.pdg_id for opt in options]
    assert len(pdgs) == len(set(pdgs))
