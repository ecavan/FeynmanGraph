# feyngraph

Interactive Feynman diagram builder that exports gammaloop-compatible `.dot`
files. The frontend [gammaloop](https://github.com/alphal00p/gammaloop) is
missing.

Drag-and-drop vertices, connect propagators, pick particles from a Standard
Model UFO model (QED / QCD / SM theory filters), see live quantum-number
conservation, and export a `.dot` file ready for
`gammaloop import graphs ...`.

## Install

```bash
pip install feyngraph
feyngraph serve
```

Open <http://localhost:8000>. On first load the canvas auto-populates with the
`e+e- → μ+μ-` starter; subsequent visits restore your last in-progress diagram
from `localStorage`.

## Use

1. **Settings tab** — pick a UFO model and a theory filter (QED / QCD / SM),
   or load a starter (`e+e- → μ+μ-`, `qq̄ → tt̄`, `gg → H` 1-loop).
2. **Canvas tab** — drag connections between existing vertices, watch the
   Boundary balance sidebar update live (charge / lepton # / baryon # / color
   triality). The Issues panel flags any missing particle assignments,
   illegal vertices, or conservation violations.
3. **Export tab** — click *Export .dot*. The output is the gammaloop-format
   `.dot` you'd feed to:

       gammaloop import graphs process.dot -p my_process -i my_integrand

## What's in scope (v0.1)

- Drag-to-connect diagram editing for arbitrary tree + multi-loop topology
- Bundled Standard Model UFO (43 particles, 153 vertex rules)
- Three theory filters (QED, QCD, SM)
- Real-time conservation checks (charge, lepton #, baryon #, color triality)
- Three curated starter diagrams loadable from the Settings tab
- Pure-Python loop momentum routing via spanning-tree cycle basis

## What's out of scope

- Bundled gammaloop solver — you install it separately
- Symbolic numerator generation — gammaloop derives this from the .dot
- BSM UFO models beyond user-supplied conversions
- User-customizable loop momentum routing

See `docs/ARCHITECTURE.md` for the full module breakdown and `docs/DOT_FORMAT.md`
for the gammaloop input dialect we emit.

## License

MIT
