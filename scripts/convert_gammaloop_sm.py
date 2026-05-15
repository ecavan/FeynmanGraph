"""One-shot adapter: gammaloop's sm.json -> feyngraph's Model schema.

Run once when bumping the SM model:
    python scripts/convert_gammaloop_sm.py \
        --src ~/Documents/GitHub/gammaloop/assets/models/json/sm/sm.json \
        --dst feyngraph/data/models/sm.json

The adapter performs these transforms:
- particle.pdg_code -> pdg_id
- particle.antiname -> anti_name
- particle.spin (2S+1 convention) -> ours (2S convention): ours = max(0, gl - 1)
- baryon_number is derived from |pdg|: quarks (1..6) get +/-1/3, everything else 0
- color is kept as-is (1=singlet, 3=triplet, -3=antitriplet, 8=octet)
- vertex_rules.particles (list of names) -> our vertices.particles (list of PDG IDs).
  Antiparticle name lookups assume the antiparticle PDG = -particle PDG (SM convention).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def derive_baryon_number(pdg: int) -> float:
    """Quarks (PDG 1..6) carry baryon number +/-1/3; everything else 0."""
    if 1 <= abs(pdg) <= 6:
        return (1.0 / 3.0) * (1 if pdg > 0 else -1)
    return 0.0


def convert_particle(gl_p: dict) -> dict:
    pdg = int(gl_p["pdg_code"])
    return {
        "pdg_id": pdg,
        "name": gl_p["name"],
        "anti_name": gl_p["antiname"],
        "mass": str(gl_p["mass"]),
        "charge": float(gl_p["charge"]),
        "lepton_number": int(gl_p["lepton_number"]),
        "baryon_number": derive_baryon_number(pdg),
        "spin": max(0, int(gl_p["spin"]) - 1),
        "color_rep": int(gl_p["color"]),
    }


def build_name_to_pdg(particles: list[dict]) -> dict[str, int]:
    name_to_pdg: dict[str, int] = {}
    for p in particles:
        pdg = int(p["pdg_code"])
        name_to_pdg.setdefault(p["name"], pdg)
        anti = p["antiname"]
        if anti != p["name"]:
            # SM convention: antiparticle PDG = -particle PDG
            name_to_pdg.setdefault(anti, -pdg)
    return name_to_pdg


def convert_vertex(gl_v: dict, name_to_pdg: dict[str, int]) -> dict | None:
    pdg_list: list[int] = []
    for name in gl_v["particles"]:
        pdg = name_to_pdg.get(name)
        if pdg is None:
            return None
        pdg_list.append(pdg)
    return {"id": gl_v["name"], "particles": pdg_list}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", required=True, help="Path to gammaloop's sm.json")
    parser.add_argument("--dst", required=True, help="Output path for feyngraph SM JSON")
    parser.add_argument("--name", default="Standard Model", help="Model display name")
    args = parser.parse_args()

    src = Path(args.src).expanduser().resolve()
    dst = Path(args.dst).expanduser().resolve()

    gl = json.loads(src.read_text())
    name_to_pdg = build_name_to_pdg(gl["particles"])

    particles = [convert_particle(p) for p in gl["particles"]]
    vertices: list[dict] = []
    dropped = 0
    for gl_v in gl["vertex_rules"]:
        out = convert_vertex(gl_v, name_to_pdg)
        if out is None:
            dropped += 1
        else:
            vertices.append(out)

    out = {"id": dst.stem, "name": args.name, "particles": particles, "vertices": vertices}
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, indent=2))

    print(f"converted: {len(particles)} particles, {len(vertices)} vertices "
          f"(dropped {dropped} vertices with unknown particles)")
    print(f"wrote: {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
