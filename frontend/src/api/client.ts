import type {
  APIError,
  CompletionOption,
  ExampleSpec,
  ExportResponse,
  GraphIssue,
  Model,
  ModelCommandResponse,
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

const APP_BASE_URL = import.meta.env.BASE_URL || "/";
const normalizedAppBase = APP_BASE_URL.endsWith("/")
  ? APP_BASE_URL
  : `${APP_BASE_URL}/`;
const DEFAULT_API_BASE = `${normalizedAppBase}api`;

export class ApiClient {
  constructor(private base: string = DEFAULT_API_BASE) {}

  private url(path: string): string {
    if (this.base === "") {
      return path;
    }
    if (/^https?:\/\//.test(this.base)) {
      return `${this.base}${path}`;
    }
    if (path.startsWith("/api/") || path === "/api") {
      return `${this.base}${path.slice("/api".length)}`;
    }
    return `${this.base}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(this.url(path), init);
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

  runModelCommand(
    modelId: string,
    command: string,
  ): Promise<ModelCommandResponse> {
    return this.request("/api/model-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId, command }),
    });
  }

  listTheories(): Promise<TheoryMeta[]> {
    return this.request("/api/theories");
  }

  reset(): Promise<{ status: string; removed: number }> {
    return this.request("/api/reset", { method: "POST" });
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

  validateGraph(spec: unknown): Promise<{
    issues: GraphIssue[];
    chord_edge_ids: string[];
    loop_count: number;
  }> {
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

  generateAmp(
    req: {
      initial_state: string[];
      final_state: string[];
      coupling_orders?: Record<string, number>;
      loop_count?: number;
      model_id?: string;
      theory_id?: string;
      max_diagrams?: number;
      active_particles?: string[];
      numerator_grouping?:
        | "no_grouping"
        | "only_detect_zeroes"
        | "group_identical_graphs_up_to_sign"
        | "group_identical_graphs_up_to_scalar_rescaling";
    },
    signal?: AbortSignal,
  ): Promise<{ diagrams: ExampleSpec[]; count: number; truncated: boolean }> {
    return this.request("/api/generate-amp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  }

  getNumerator(
    spec: ExampleSpec,
    signal?: AbortSignal,
  ): Promise<{
    raw: string;
    format: string;
    warnings: string[];
    propagators: { momentum: string; particle: string }[];
  }> {
    return this.request("/api/numerator", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
      signal,
    });
  }

  getReduce(
    spec: ExampleSpec,
    signal?: AbortSignal,
  ): Promise<{
    raw: string;
    format: string;
    warnings: string[];
    reason?: string | null;
  }> {
    return this.request("/api/reduce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
      signal,
    });
  }

  estimate(
    req: {
      initial_state: string[];
      final_state: string[];
      coupling_orders?: Record<string, number>;
      loop_count?: number;
      model_id?: string;
      theory_id?: string;
      numerator_grouping?:
        | "no_grouping"
        | "only_detect_zeroes"
        | "group_identical_graphs_up_to_sign"
        | "group_identical_graphs_up_to_scalar_rescaling";
    },
    signal?: AbortSignal,
  ): Promise<{
    estimated_ram_gb: number;
    estimated_runtime_s: number;
    severity: "green" | "yellow" | "red";
    confidence: "high" | "low";
    source:
      | "calibrated"
      | "interpolated"
      | "extrapolated"
      | "nearest_theory"
      | "no_data";
  }> {
    return this.request("/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  }

  async exportDotBatch(
    diagrams: ExampleSpec[],
    archiveName: string,
  ): Promise<Blob> {
    const resp = await fetch(this.url("/api/export-dot-batch"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diagrams, archive_name: archiveName }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      let payload: APIError = { detail: text, code: "REQUEST_FAILED" };
      try {
        payload = JSON.parse(text);
      } catch {}
      throw new ApiError(payload);
    }
    return resp.blob();
  }

  async importDot(
    file: File,
    modelId: string,
    theoryId: string,
  ): Promise<ExampleSpec> {
    const form = new FormData();
    form.append("file", file);
    form.append("model_id", modelId);
    form.append("theory_id", theoryId);
    const resp = await fetch(this.url("/api/import-dot"), {
      method: "POST",
      body: form,
    });
    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({
        detail: resp.statusText,
        code: "HTTP_ERROR",
      }))) as APIError;
      throw new ApiError(body);
    }
    return resp.json();
  }

  async uploadUfo(
    file: File,
    options: {
      modelId?: string;
      restrictionName?: string;
      overwrite?: boolean;
    } = {},
  ): Promise<{
    id: string;
    name: string;
    particles: number;
    vertices: number;
  }> {
    const form = new FormData();
    form.append("file", file);
    if (options.modelId) form.append("model_id", options.modelId);
    if (options.restrictionName)
      form.append("restriction_name", options.restrictionName);
    if (options.overwrite) form.append("overwrite", "true");

    const resp = await fetch(this.url("/api/models/upload-ufo"), {
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
