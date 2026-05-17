from io import StringIO

from feyngraph.domain.cycle_basis import compute_loop_momenta
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.legality import matching_ufo_vertices
from feyngraph.domain.model_schema import Model, Particle


class DotWriterError(Exception):
    pass


class UnassignedEdgeError(DotWriterError):
    pass


class NoExternalLegsError(DotWriterError):
    pass


def to_gammaloop_dot(spec: GraphSpec, model: Model) -> str:
    if not spec.external_legs:
        raise NoExternalLegsError("graph has no external legs marked")
    unassigned = [e.id for e in spec.edges if e.particle_pdg_id is None]
    if unassigned:
        raise UnassignedEdgeError(f"edges without particle: {unassigned}")

    external_node_ids = {leg.node_id for leg in spec.external_legs}
    label_by_node = {leg.node_id: leg.label for leg in spec.external_legs}
    chord_set = set(compute_loop_momenta(spec).chord_edge_ids)

    edge_labels: dict[str, str] = {}
    q_counter = 0
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
    buf.write('  overall_factor="1";\n')
    projector = _build_projector(spec, model)
    buf.write(f'  projector="{projector}";\n')

    for leg in spec.external_legs:
        buf.write(f"  {leg.node_id} [style=invis];\n")

    # If the user's claimed ufo_vertex_id doesn't match the vertex's actual
    # incident-particle multiset, drop the int_id so gammaloop falls back to
    # its own incidence lookup (which can self-heal or reject cleanly). This
    # closes the parity gap where gammaloop blindly trusts mismatched labels.
    incidence_by_node = _all_incoming_pdgs(spec, external_node_ids)
    for node in spec.nodes:
        if node.id in external_node_ids:
            continue
        keep_int_id = (
            node.ufo_vertex_id is not None
            and node.ufo_vertex_id in matching_ufo_vertices(incidence_by_node[node.id], model)
        )
        if keep_int_id:
            buf.write(f'  {node.id} [int_id="{node.ufo_vertex_id}"];\n')
        else:
            buf.write(f"  {node.id};\n")

    chord_index_by_edge: dict[str, int] = {}
    for edge in spec.edges:
        if edge.id in chord_set:
            chord_index_by_edge[edge.id] = len(chord_index_by_edge)

    # Assign globally-sequential port numbers so gammaloop's hedge(N) ids line
    # up with our edge order. External edges get ports 0..N_ext-1 in their
    # spec.edges order (matching the projector). Internal edges then get a
    # port on each endpoint, continuing from N_ext. We write external edges
    # first so port assignment stays contiguous regardless of edge interleaving.
    # The `id=N` attribute is also required: gammaloop uses it (despite being
    # listed as "ignored" in its parser) to keep edge order stable through
    # import — without it, `loop_momentum_basis.ext_from(hedge(0))` panics
    # during inspect because external edges get reordered.
    ext_edges = []
    int_edges = []
    for edge in spec.edges:
        if edge.source_node_id in external_node_ids or edge.target_node_id in external_node_ids:
            ext_edges.append(edge)
        else:
            int_edges.append(edge)

    port = 0
    edge_id_counter = 0
    for edge in ext_edges:
        src_ext = edge.source_node_id in external_node_ids
        attrs = [f'id={edge_id_counter}', f'pdg="{edge.particle_pdg_id}"', f'name="{edge_labels[edge.id]}"']
        if edge.id in chord_set:
            attrs.append(f'lmb_id="{chord_index_by_edge[edge.id]}"')
        if src_ext:
            line = f"  {edge.source_node_id} -> {edge.target_node_id}:{port} [{', '.join(attrs)}];\n"
        else:
            line = f"  {edge.source_node_id}:{port} -> {edge.target_node_id} [{', '.join(attrs)}];\n"
        buf.write(line)
        port += 1
        edge_id_counter += 1

    for edge in int_edges:
        attrs = [f'id={edge_id_counter}', f'pdg="{edge.particle_pdg_id}"', f'name="{edge_labels[edge.id]}"']
        if edge.id in chord_set:
            attrs.append(f'lmb_id="{chord_index_by_edge[edge.id]}"')
        line = f"  {edge.source_node_id}:{port} -> {edge.target_node_id}:{port + 1} [{', '.join(attrs)}];\n"
        buf.write(line)
        port += 2
        edge_id_counter += 1

    buf.write("}\n")
    return buf.getvalue()


def _all_incoming_pdgs(spec: GraphSpec, external_node_ids: set[str]) -> dict[str, list[int]]:
    """For each internal vertex, list incident particle PDGs in the all-incoming
    convention (outgoing edges contribute their antiparticle)."""
    out: dict[str, list[int]] = {n.id: [] for n in spec.nodes if n.id not in external_node_ids}
    for edge in spec.edges:
        if edge.particle_pdg_id is None:
            continue
        if edge.source_node_id in out:
            out[edge.source_node_id].append(-edge.particle_pdg_id)
        if edge.target_node_id in out:
            out[edge.target_node_id].append(edge.particle_pdg_id)
    return out


def _polarization_term(particle: Particle, idx: int, kind: str) -> str | None:
    """Lorentz polarization/spinor for one external leg.

    Conventions:
      spin = 2J  (matches feyngraph Model schema; 0=scalar, 1=fermion, 2=vector)
      kind = "incoming" | "outgoing"
      particle is identified as antiparticle iff pdg_id < 0 (skipped for
      self-conjugate particles like γ/Z/H which carry no anti distinction).
    """
    is_anti = particle.pdg_id < 0 and particle.anti_name != particle.name
    h = f"hedge({idx})"
    if particle.spin == 0:
        return None
    if particle.spin == 1:
        if kind == "incoming":
            sym = "vbar" if is_anti else "u"
        else:
            sym = "v" if is_anti else "ubar"
        return f"{sym}({idx},spenso::bis(4,{h}))"
    if particle.spin == 2:
        sym = "ϵ" if kind == "incoming" else "ϵbar"
        return f"{sym}({idx},spenso::mink(4,{h}))"
    return None


def _color_pairings(externals: list[dict]) -> list[str] | None:
    """Color-singlet contraction terms for paired external colored particles.

    Returns None if the colored externals can't be paired into singlets
    (odd number of gluons or mismatched q/q̄ counts) — callers should fall
    back to a polarization-only projector.
    """
    gluons: list[int] = []
    quarks: list[int] = []
    antiquarks: list[int] = []
    for ext in externals:
        p = ext["particle"]
        if p.color_rep == 8:
            gluons.append(ext["idx"])
        elif p.color_rep == 3:
            quarks.append(ext["idx"])
        elif p.color_rep == -3:
            antiquarks.append(ext["idx"])

    if len(gluons) % 2 != 0 or len(quarks) != len(antiquarks):
        return None

    terms = []
    for h0, h1 in zip(gluons[0::2], gluons[1::2]):
        terms.append(
            f"(1/8)*spenso::g(spenso::coad(8,hedge({h0})),spenso::coad(8,hedge({h1})))"
        )
    for hq, hqbar in zip(quarks, antiquarks):
        terms.append(
            f"(1/3)*spenso::g(spenso::dind(spenso::cof(3,hedge({hqbar}))),spenso::cof(3,hedge({hq})))"
        )
    return terms


def _build_projector(spec: GraphSpec, model: Model) -> str:
    by_pdg = {p.pdg_id: p for p in model.particles}
    external_node_ids = {leg.node_id for leg in spec.external_legs}
    leg_kind = {leg.node_id: leg.kind for leg in spec.external_legs}

    # The hedge index in the projector must match the explicit port number
    # we write on the internal side of each external edge in to_gammaloop_dot.
    # That port is assigned 0..N-1 in the order external edges appear in spec.
    externals: list[dict] = []
    ext_port = 0
    for edge in spec.edges:
        if edge.source_node_id in external_node_ids:
            ext_node = edge.source_node_id
        elif edge.target_node_id in external_node_ids:
            ext_node = edge.target_node_id
        else:
            continue
        particle = by_pdg.get(edge.particle_pdg_id) if edge.particle_pdg_id is not None else None
        if particle is None:
            ext_port += 1
            continue
        externals.append({"idx": ext_port, "particle": particle, "kind": leg_kind[ext_node]})
        ext_port += 1

    parts: list[str] = []
    for ext in externals:
        term = _polarization_term(ext["particle"], ext["idx"], ext["kind"])
        if term:
            parts.append(term)
    color_terms = _color_pairings(externals)
    if color_terms:
        parts.extend(color_terms)
    return "*".join(parts) or "1"
