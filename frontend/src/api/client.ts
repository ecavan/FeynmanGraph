import type {
  APIError,
  CompletionOption,
  ExampleSpec,
  ExportResponse,
  GraphIssue,
  Model,
  ModelMeta,
  TheoryMeta,
} from "./types";

export class ApiError extends Error {
  code: string;
  hint?: string;
  fields?: Record<string, string>;
  constructor(err: APIError) {
    super(err.detail);
    this.code = err.code;
    this.hint = err.hint;
    this.fields = err.fields;
  }
}

export class ApiClient {
  constructor(private base: string = "") {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(`${this.base}${path}`, init);
    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({
        detail: resp.statusText,
        code: "HTTP_ERROR",
      }))) as APIError;
      throw new ApiError(body);
    }
    return (await resp.json()) as T;
  }

  listModels(): Promise<ModelMeta[]> {
    return this.request("/api/models");
  }

  getModel(id: string, theoryId?: string): Promise<Model> {
    const q = theoryId ? `?theory=${encodeURIComponent(theoryId)}` : "";
    return this.request(`/api/models/${encodeURIComponent(id)}${q}`);
  }

  listTheories(): Promise<TheoryMeta[]> {
    return this.request("/api/theories");
  }

  validateVertex(req: {
    model_id: string;
    theory_id: string;
    partial: { known_pdgs: number[]; unknown_count: number };
  }): Promise<{ options: CompletionOption[] }> {
    return this.request("/api/validate-vertex", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  }

  validateGraph(
    spec: unknown,
  ): Promise<{ issues: GraphIssue[]; chord_edge_ids: string[]; loop_count: number }> {
    return this.request("/api/validate-graph", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
  }

  exportDot(spec: unknown): Promise<ExportResponse> {
    return this.request("/api/export-dot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
  }

  generateAmp(req: {
    initial_state: string[];
    final_state: string[];
    coupling_orders?: Record<string, number>;
    loop_count?: number;
    model_id?: string;
    theory_id?: string;
    max_diagrams?: number;
  }): Promise<{ diagrams: ExampleSpec[]; count: number; truncated: boolean }> {
    return this.request("/api/generate-amp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  }

  async exportDotBatch(diagrams: ExampleSpec[], archiveName: string): Promise<Blob> {
    const resp = await fetch(`${this.base}/api/export-dot-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diagrams, archive_name: archiveName }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      let payload: APIError = { detail: text, code: "REQUEST_FAILED" };
      try { payload = JSON.parse(text); } catch {}
      throw new ApiError(payload);
    }
    return resp.blob();
  }

  async uploadUfo(
    file: File,
    options: { modelId?: string; restrictionName?: string; overwrite?: boolean } = {},
  ): Promise<{ id: string; name: string; particles: number; vertices: number }> {
    const form = new FormData();
    form.append("file", file);
    if (options.modelId) form.append("model_id", options.modelId);
    if (options.restrictionName) form.append("restriction_name", options.restrictionName);
    if (options.overwrite) form.append("overwrite", "true");

    const resp = await fetch(`${this.base}/api/models/upload-ufo`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({
        detail: resp.statusText,
        code: "HTTP_ERROR",
      }))) as { detail: string; code: string; hint?: string };
      throw new ApiError(body);
    }
    return resp.json();
  }
}
