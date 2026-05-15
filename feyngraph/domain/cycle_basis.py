"""Loop momentum routing via spanning-tree cycle basis.

For each independent cycle (chord edge), assign a fresh loop momentum k_i.
The user never picks loop momenta; topology determines them.
"""

from __future__ import annotations

from dataclasses import dataclass

import networkx as nx

from feyngraph.domain.graph_spec import GraphSpec


@dataclass(frozen=True)
class LoopAssignment:
    chord_edge_ids: list[str]   # edge.id values, one per independent cycle

    @property
    def loop_count(self) -> int:
        return len(self.chord_edge_ids)


class InvalidLoopOverrideError(ValueError):
    """Raised when a user-supplied lmb_edge_ids list is not a valid chord set."""


def _expected_loop_count(spec: GraphSpec) -> int:
    """How many independent cycles does this graph have? (cyclomatic number)"""
    g: nx.MultiGraph[str] = nx.MultiGraph()
    for node in spec.nodes:
        g.add_node(node.id)
    for edge in spec.edges:
        g.add_edge(edge.source_node_id, edge.target_node_id)
    if g.number_of_edges() == 0:
        return 0
    # #independent_cycles = E - V + #connected_components
    return g.number_of_edges() - g.number_of_nodes() + nx.number_connected_components(
        nx.Graph(g)
    )


def _validate_override(spec: GraphSpec, override_ids: list[str]) -> None:
    """Check that `override_ids` is a valid chord-edge set for `spec`.

    A valid chord set has size equal to the cyclomatic number AND removing
    those edges leaves a spanning forest (i.e., the remaining edges contain
    no cycles).
    """
    edge_ids = {e.id for e in spec.edges}
    unknown = [eid for eid in override_ids if eid not in edge_ids]
    if unknown:
        raise InvalidLoopOverrideError(f"unknown edge ids in lmb_edge_ids: {unknown}")
    if len(set(override_ids)) != len(override_ids):
        raise InvalidLoopOverrideError("lmb_edge_ids contains duplicates")

    expected = _expected_loop_count(spec)
    if len(override_ids) != expected:
        raise InvalidLoopOverrideError(
            f"lmb_edge_ids has {len(override_ids)} entries but graph has {expected} "
            f"independent cycles (E - V + components)"
        )

    # Removing the override edges must yield a graph with no cycles.
    override_set = set(override_ids)
    remaining: nx.MultiGraph[str] = nx.MultiGraph()
    for node in spec.nodes:
        remaining.add_node(node.id)
    for edge in spec.edges:
        if edge.id not in override_set:
            remaining.add_edge(edge.source_node_id, edge.target_node_id, edge_id=edge.id)
    # An undirected graph with E edges and V nodes is a forest iff E == V - C
    # where C is the number of connected components.
    if remaining.number_of_edges() != remaining.number_of_nodes() - nx.number_connected_components(
        nx.Graph(remaining)
    ):
        raise InvalidLoopOverrideError(
            "lmb_edge_ids does not form a valid chord set: removing them "
            "leaves a graph that still contains cycles"
        )


def compute_loop_momenta(spec: GraphSpec) -> LoopAssignment:
    """Identify chord edges (one per independent cycle).

    Strategy:
    - If `spec.lmb_edge_ids` is set (non-empty), validate it as a chord set
      and use it as-is. Raises `InvalidLoopOverrideError` if invalid.
    - Otherwise, automatically pick chord edges via a spanning-tree algorithm.
      For a connected graph, #independent_cycles = E - V + 1.
    """
    if spec.lmb_edge_ids:
        _validate_override(spec, spec.lmb_edge_ids)
        return LoopAssignment(chord_edge_ids=list(spec.lmb_edge_ids))

    g: nx.MultiGraph[str] = nx.MultiGraph()
    for node in spec.nodes:
        g.add_node(node.id)
    for edge in spec.edges:
        g.add_edge(edge.source_node_id, edge.target_node_id, edge_id=edge.id)

    if g.number_of_nodes() == 0 or g.number_of_edges() == 0:
        return LoopAssignment(chord_edge_ids=[])

    # Build a simple-graph view (parallel edges collapsed) and take its MST.
    simple: nx.Graph[str] = nx.Graph()
    simple.add_nodes_from(g.nodes())
    seen: set[tuple[str, str]] = set()
    for u, v in g.edges():
        key = (u, v) if u <= v else (v, u)
        if key not in seen:
            seen.add(key)
            simple.add_edge(u, v)
    mst = nx.minimum_spanning_tree(simple)

    tree_edges: set[str] = set()
    for u, v in mst.edges():
        data_list = list(g.get_edge_data(u, v).values())
        tree_edges.add(data_list[0]["edge_id"])

    chord_ids: list[str] = [edge.id for edge in spec.edges if edge.id not in tree_edges]
    return LoopAssignment(chord_edge_ids=chord_ids)
