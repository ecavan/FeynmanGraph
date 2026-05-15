import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Particle } from "../api/types";
import { ParticlePicker } from "./ParticlePicker";

const particles: Particle[] = [
  {
    pdg_id: 22, name: "a", anti_name: "a", mass: "0",
    charge: 0, lepton_number: 0, baryon_number: 0, spin: 2, color_rep: 1,
  },
  {
    pdg_id: 23, name: "Z", anti_name: "Z", mass: "MZ",
    charge: 0, lepton_number: 0, baryon_number: 0, spin: 2, color_rep: 1,
  },
];

describe("ParticlePicker", () => {
  it("marks legal completions as legal and others as illegal", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ options: [{ pdg_id: 22, ufo_vertex_id: "V_QED_eea" }] }),
        { status: 200 },
      ),
    );
    render(
      <ParticlePicker
        modelId="sm"
        theoryId="qed"
        knownPdgs={[11, -11]}
        unknownCount={1}
        allParticles={particles}
        onPick={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/a \(legal\)/)).toBeInTheDocument());
    expect(screen.getByText(/Z \(illegal\)/)).toBeInTheDocument();
  });

  it("calls onPick with the selected pdg id", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ options: [{ pdg_id: 22, ufo_vertex_id: "V_QED_eea" }] }),
        { status: 200 },
      ),
    );
    const onPick = vi.fn();
    render(
      <ParticlePicker
        modelId="sm"
        theoryId="qed"
        knownPdgs={[11, -11]}
        unknownCount={1}
        allParticles={particles}
        onPick={onPick}
      />,
    );
    const btn = await screen.findByText(/a \(legal\)/);
    btn.click();
    expect(onPick).toHaveBeenCalledWith(22);
  });

  it("falls back to all-illegal if the API errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response("nope", { status: 500 }));
    render(
      <ParticlePicker
        modelId="sm"
        theoryId="qed"
        knownPdgs={[]}
        unknownCount={3}
        allParticles={particles}
        onPick={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/a \(illegal\)/)).toBeInTheDocument());
  });
});
