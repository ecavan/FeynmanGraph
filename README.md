# feyngraph

Web frontend for building Feynman diagrams and exporting them to gammaloop `.dot` files.

## Install

```bash
pip install feyngraph
feyngraph serve
```

Open <http://localhost:8000>.

Generation needs `gammaloop` on `PATH` (or under `~/Documents/GitHub/gammaloop`).

## What it does

- **Build diagrams.** Drag vertices, connect propagators, place external legs. Charge, lepton number, baryon number, and color triality are checked as you go, and each vertex is matched against the UFO interaction list — you can't build something that isn't a real diagram.
- **Generate from a process.** Type `e+ e- → mu+ mu-`, pick couplings and loop count, and gammaloop enumerates the diagrams for you. Click any thumbnail to load it onto the canvas.
- **Import UFO models.** Upload a `.zip` or `.tar.gz` of any UFO model (BSM, EFT, your own). Particles and vertices light up immediately.
- **Export `.dot`.** Single diagram or the whole gallery.

## License

MIT
