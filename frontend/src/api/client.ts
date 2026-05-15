import type {
  APIError,
  CompletionOption,
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

  getModel(id: string): Promise<Model> {
    return this.request(`/api/models/${encodeURIComponent(id)}`);
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

  validateGraph(spec: unknown): Promise<{ issues: GraphIssue[] }> {
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
}
