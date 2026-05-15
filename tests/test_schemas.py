from feyngraph.domain.graph_spec import (
    EdgeDirection,
    ExternalLeg,
    GraphSpec,
    ParticleEdge,
    VertexNode,
)
from feyngraph.domain.model_schema import Model, Particle, Vertex


def test_graph_spec_roundtrip():
    spec = GraphSpec(
        model_id="sm",
        theory_id="qed",
        nodes=[
            VertexNode(id="v1", position=(0.0, 0.0)),
            VertexNode(id="v2", position=(100.0, 0.0)),
        ],
        edges=[
            ParticleEdge(
                id="e1",
                source_node_id="v1",
                target_node_id="v2",
                particle_pdg_id=22,
                direction=EdgeDirection.SOURCE_TO_TARGET,
            ),
        ],
        external_legs=[],
    )
    dumped = spec.model_dump_json()
    restored = GraphSpec.model_validate_json(dumped)
    assert restored == spec


def test_model_has_particles_and_vertices():
    m = Model(
        id="qed",
        name="QED",
        particles=[
            Particle(
                pdg_id=22, name="a", anti_name="a", mass="0",
                charge=0, lepton_number=0, baryon_number=0,
                spin=2, color_rep=1,
            ),
        ],
        vertices=[Vertex(id="V_QED_FFV", particles=[22, 11, -11])],
    )
    assert m.particles[0].pdg_id == 22
    assert m.vertices[0].particles == [22, 11, -11]


def test_external_leg_kind_enum():
    leg = ExternalLeg(node_id="v1", kind="incoming", label="p1")
    assert leg.kind == "incoming"
