"""Emit gammaloop-compatible .dot input files from a GraphSpec.

See spec section 7 for the format reference. Output mirrors gammaloop's
`tree_triangle.dot` and `massless_box.dot` conventions.
"""

from __future__ import annotations

from io import StringIO

from feyngraph.domain.cycle_basis import compute_loop_momenta
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.model_schema import Model


class DotWriterError(Exception):
    """Base class for .dot writer errors."""


class UnassignedEdgeError(DotWriterError):
    """Raised when an edge has no particle PDG assigned."""


class NoExternalLegsError(DotWriterError):
    """Raised when no external legs are marked."""


def to_gammaloop_dot(spec: GraphSpec, model: Model) -> str:
    # The `model` parameter is currently unused but kept in the signature: it
    # will be needed when we emit `int_id="..."` for UFO-resolved vertices and
    # when we cross-check edge particles against the model on the way out.
    _ = model
    if not spec.external_legs:
        raise NoExternalLegsError("graph has no external legs marked")
    unassigned = [e.id for e in spec.edges if e.particle_pdg_id is None]
    if unassigned:
        raise UnassignedEdgeError(f"edges without particle: {unassigned}")

    external_node_ids = {leg.node_id for leg in spec.external_legs}
    label_by_node = {leg.node_id: leg.label for leg in spec.external_legs}
    loop_assignment = compute_loop_momenta(spec)
    chord_set = set(loop_assignment.chord_edge_ids)

    # Assign sequential internal-edge labels q1, q2, ...
    q_counter = 0
    edge_labels: dict[str, str] = {}
    for edge in spec.edges:
        if edge.source_node_id in external_node_ids:
            edge_labels[edge.id] = label_by_node[edge.source_node_id]
        elif edge.target_node_id in external_node_ids:
            edge_labels[edge.id] = label_by_node[edge.target_node_id]
        else:
            q_counter += 1
            edge_labels[edge.id] = f"q{q_counter}"

    buf = StringIO()
    buf.write(f"digraph {spec.process_name} {{\n")
    # `overall_factor` is a gammaloop-known graph attribute; `multiplicity_factor`
    # is NOT — see gammaloop's attribute_warnings.rs GRAPH_SPEC.
    buf.write('  overall_factor="1";\n')

    for leg in spec.external_legs:
        buf.write(f"  {leg.node_id} [style=invis];\n")

    for node in spec.nodes:
        if node.id in external_node_ids:
            continue
        if node.ufo_vertex_id is not None:
            buf.write(f'  {node.id} [int_id="{node.ufo_vertex_id}"];\n')
        else:
            buf.write(f"  {node.id};\n")

    chord_index = 0
    chord_index_by_edge: dict[str, int] = {}
    for edge in spec.edges:
        if edge.id in chord_set:
            chord_index_by_edge[edge.id] = chord_index
            chord_index += 1

    for edge in spec.edges:
        label = edge_labels[edge.id]
        # Attribute names follow gammaloop's expectations (see gammaloop's
        # examples/cli/aa_aa/1L/aa_aa_1L.dot for the canonical format):
        # - `name="..."` for edge label (quoted)
        # - `pdg="..."` for particle PDG id (quoted)
        # - `lmb_id="N"` for chord edges (quoted integer)
        attrs = [f'pdg="{edge.particle_pdg_id}"', f'name="{label}"']
        if edge.id in chord_set:
            attrs.append(f'lmb_id="{chord_index_by_edge[edge.id]}"')
        buf.write(
            f"  {edge.source_node_id} -> {edge.target_node_id} [{', '.join(attrs)}];\n"
        )

    buf.write("}\n")
    return buf.getvalue()
