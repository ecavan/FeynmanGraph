export type ModelMeta = { id: string; name: string };

export type Particle = {
  pdg_id: number;
  name: string;
  anti_name: string;
  mass: string;
  charge: number;
  lepton_number: number;
  baryon_number: number;
  spin: number;
  color_rep: number;
};

export type Vertex = { id: string; particles: number[] };

export type Model = {
  id: string;
  name: string;
  particles: Particle[];
  vertices: Vertex[];
};

export type TheoryMeta = { id: string; name: string };

export type CompletionOption = { pdg_id: number; ufo_vertex_id: string };

export type ModelCommandResponse = { output: string };

export type GraphIssue = {
  code: string;
  detail: string;
  element_ids: string[];
  deficit?: number | null;
};

export type APIError = {
  detail: string;
  code: string;
  hint?: string;
  fields?: Record<string, string>;
};

export type ExportResponse = { dot: string; warnings: string[] };

export type ExampleSpec = {
  model_id: string;
  theory_id: string;
  process_name: string;
  nodes: {
    id: string;
    position: [number, number];
    ufo_vertex_id?: string | null;
  }[];
  edges: {
    id: string;
    source_node_id: string;
    target_node_id: string;
    particle_pdg_id: number | null;
    direction?: "source_to_target" | "target_to_source";
    cut_label?: string | null;
  }[];
  external_legs: {
    node_id: string;
    kind: "incoming" | "outgoing";
    label: string;
  }[];
};
