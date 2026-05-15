from feyngraph.domain.cycle_basis import compute_loop_momenta
from feyngraph.domain.graph_spec import GraphSpec, ParticleEdge, VertexNode


def _spec_from_edges(edges: list[tuple[str, str]]) -> GraphSpec:
    nodes: dict[str, VertexNode] = {}
    for src, tgt in edges:
        for n in (src, tgt):
            nodes.setdefault(n, VertexNode(id=n, position=(0.0, 0.0)))
    return GraphSpec(
        model_id="x",
        theory_id="qed",
        nodes=list(nodes.values()),
        edges=[
            ParticleEdge(id=f"e{i}", source_node_id=s, target_node_id=t)
            for i, (s, t) in enumerate(edges)
        ],
        external_legs=[],
    )


def test_tree_has_no_loop_momenta():
    spec = _spec_from_edges([("v1", "v2"), ("v2", "v3"), ("v3", "v4")])
    assignment = compute_loop_momenta(spec)
    assert assignment.chord_edge_ids == []
    assert assignment.loop_count == 0


def test_triangle_has_one_loop():
    spec = _spec_from_edges([("v1", "v2"), ("v2", "v3"), ("v3", "v1")])
    assignment = compute_loop_momenta(spec)
    assert assignment.loop_count == 1
    assert len(assignment.chord_edge_ids) == 1


def test_box_has_one_loop():
    spec = _spec_from_edges([("v1", "v2"), ("v2", "v3"), ("v3", "v4"), ("v4", "v1")])
    assignment = compute_loop_momenta(spec)
    assert assignment.loop_count == 1
    assert len(assignment.chord_edge_ids) == 1


def test_complete_graph_k4_has_three_loops():
    # K4: 4 nodes, 6 edges, fully connected -> E - V + 1 = 6 - 4 + 1 = 3 independent loops
    spec = _spec_from_edges([
        ("v1", "v2"), ("v2", "v3"), ("v3", "v1"),
        ("v2", "v4"), ("v4", "v3"),
        ("v1", "v4"),
    ])
    assignment = compute_loop_momenta(spec)
    assert assignment.loop_count == 3
