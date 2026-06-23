import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./client";

describe("ApiClient", () => {
  it("listModels calls /api/models", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "sm", name: "SM" }]), { status: 200 }),
    );
    const client = new ApiClient("http://localhost:8000");
    const models = await client.listModels();
    expect(models).toEqual([{ id: "sm", name: "SM" }]);
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:8000/api/models", undefined);
  });

  it("getModel throws ApiError on 404 with structured payload", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: "not found", code: "MODEL_NOT_FOUND", hint: "use /api/models" }),
        { status: 404 },
      ),
    );
    const client = new ApiClient("http://localhost:8000");
    const err = await client.getModel("missing").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("MODEL_NOT_FOUND");
    expect(err.message).toBe("not found");
    expect(err.hint).toBe("use /api/models");
  });

  it("validateVertex POSTs with JSON body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ options: [{ pdg_id: 22, ufo_vertex_id: "V_QED" }] }), {
        status: 200,
      }),
    );
    const client = new ApiClient("");
    const out = await client.validateVertex({
      model_id: "sm",
      theory_id: "qed",
      partial: { known_pdgs: [11, -11], unknown_count: 1 },
    });
    expect(out.options).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/validate-vertex",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reset POSTs to /api/reset", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok", removed: 2 }), { status: 200 }),
    );
    const client = new ApiClient("");
    const out = await client.reset();
    expect(out).toEqual({ status: "ok", removed: 2 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/reset",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
