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


def compute_loop_momenta(spec: GraphSpec) -> LoopAssignment:
    """Identify chord edges (one per independent cycle) using a spanning tree.

    For a connected graph, #independent_cycles = E - V + 1.
    """
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
        # First multigraph edge between u and v is the tree edge; the rest are chords.
        tree_edges.add(data_list[0]["edge_id"])

    chord_ids: list[str] = [edge.id for edge in spec.edges if edge.id not in tree_edges]
    return LoopAssignment(chord_edge_ids=chord_ids)
