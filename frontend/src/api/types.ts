// Generated from the FastAPI backend's OpenAPI schema via `npm run generate-types`.
// For initial development, hand-author the shapes that match feyngraph.domain.*.

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

export type GraphIssue = {
  code: string;
  detail: string;
  element_ids: string[];
};

export type APIError = {
  detail: string;
  code: string;
  hint?: string;
  fields?: Record<string, string>;
};

export type ExportResponse = { dot: string; warnings: string[] };
