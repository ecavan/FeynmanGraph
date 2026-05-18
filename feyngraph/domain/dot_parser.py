import re

from feyngraph.domain.graph_spec import ExternalLeg, GraphSpec, ParticleEdge, VertexNode
from feyngraph.domain.model_schema import Model


class DotParseError(ValueError):
    pass


_DIGRAPH_HEAD = re.compile(r"digraph\s+(\w+)\s*\{")
_INTERNAL_VERTEX = re.compile(r'^\s*([A-Za-z0-9_]+)\s*\[int_id="(V_\d+)"', re.M)
_BARE_INTERNAL_VERTEX = re.compile(r"^\s*([A-Za-z0-9_]+)\s*;\s*$", re.M)
_EXTERNAL_NODE = re.compile(r"^\s*(\w+)\s*\[style=invis\]", re.M)
_EDGE = re.compile(
    r"^\s*([A-Za-z0-9_]+)(?::\d+)?\s*->\s*([A-Za-z0-9_]+)(?::\d+)?\s*\[([^\]]*)\];?",
    re.M,
)
_PARTICLE_ATTR = re.compile(r'particle="([^"]+)"')
_PDG_ATTR = re.compile(r'pdg="?(-?\d+)"?')
_LMB_ID_ATTR = re.compile(r'lmb_id="?(\d+)"?')


def _name_to_pdg(model: Model) -> dict[str, int]:
    out: dict[str, int] = {}
    for p in model.particles:
        out[p.name] = p.pdg_id
        if p.anti_name != p.name:
            out[p.anti_name] = -p.pdg_id
    return out


def parse_gammaloop_dot(
    text: str,
    model: Model,
    *,
    model_id: str = "sm",
    theory_id: str = "sm",
) -> GraphSpec:
    head = _DIGRAPH_HEAD.search(text)
    if not head:
        raise DotParseError("input is not a digraph")
    process_name = head.group(1)

    internal = {m.group(1): m.group(2) for m in _INTERNAL_VERTEX.finditer(text)}
    externals = [m.group(1) for m in _EXTERNAL_NODE.finditer(text)]
    external_set = set(externals)
    for m in _BARE_INTERNAL_VERTEX.finditer(text):
        node_id = m.group(1)
        if node_id in internal or node_id in external_set:
            continue
        internal[node_id] = ""

    name_map = _name_to_pdg(model)

    nodes: list[VertexNode] = []
    for vid, ufo in internal.items():
        nodes.append(VertexNode(
            id=vid,
            position=(0.0, 0.0),
            ufo_vertex_id=ufo if ufo else None,
        ))
    for eid in externals:
        nodes.append(VertexNode(id=eid, position=(0.0, 0.0)))

    edges: list[ParticleEdge] = []
    chord_ids: list[str] = []
    eid_counter = 0
    for m in _EDGE.finditer(text):
        src, tgt, attrs = m.group(1), m.group(2), m.group(3)
        if src not in internal and src not in externals:
            continue
        if tgt not in internal and tgt not in externals:
            continue
        pdg_value: int | None = None
        pm = _PARTICLE_ATTR.search(attrs)
        if pm is not None:
            particle_name = pm.group(1)
            if particle_name not in name_map:
                raise DotParseError(
                    f"unknown particle '{particle_name}' (not in model '{model.id}')"
                )
            pdg_value = name_map[particle_name]
        else:
            pdg_m = _PDG_ATTR.search(attrs)
            if pdg_m is None:
                continue
            pdg_value = int(pdg_m.group(1))
            known_pdgs = {p.pdg_id for p in model.particles}
            if pdg_value not in known_pdgs:
                raise DotParseError(
                    f"unknown pdg {pdg_value} (not in model '{model.id}')"
                )
        eid_counter += 1
        eid = f"e{eid_counter}"
        edges.append(ParticleEdge(
            id=eid, source_node_id=src, target_node_id=tgt,
            particle_pdg_id=pdg_value,
        ))
        if _LMB_ID_ATTR.search(attrs):
            chord_ids.append(eid)

    legs: list[ExternalLeg] = []
    p_counter = 0
    for ext_id in externals:
        kind: str | None = None
        for edge in edges:
            if edge.source_node_id == ext_id:
                kind = "incoming"
                break
            if edge.target_node_id == ext_id:
                kind = "outgoing"
                break
        if kind is None:
            continue
        p_counter += 1
        legs.append(ExternalLeg(node_id=ext_id, kind=kind, label=f"p{p_counter}"))

    return GraphSpec(
        model_id=model_id,
        theory_id=theory_id,
        process_name=process_name,
        nodes=nodes,
        edges=edges,
        external_legs=legs,
        lmb_edge_ids=chord_ids or None,
    )
