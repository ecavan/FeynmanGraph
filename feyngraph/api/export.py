import io
import os
import zipfile
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from feyngraph.api.errors import FeyngraphHTTPException
from feyngraph.domain.cycle_basis import InvalidLoopOverrideError
from feyngraph.domain.dot_writer import (
    NoExternalLegsError,
    UnassignedEdgeError,
    to_gammaloop_dot,
)
from feyngraph.domain.graph_spec import GraphSpec
from feyngraph.domain.model_loader import ModelLoader, ModelNotFoundError
from feyngraph.domain.theories import apply_theory, get_theory

router = APIRouter(prefix="/api", tags=["export"])


def _loader() -> ModelLoader:
    extra: list[Path] = []
    for raw in os.environ.get("FEYNGRAPH_EXTRA_MODEL_DIRS", "").split(os.pathsep):
        if raw:
            extra.append(Path(raw))
    return ModelLoader(extra_search_dirs=extra)


class ExportResponse(BaseModel):
    dot: str
    warnings: list[str] = []


@router.post("/export-dot", response_model=ExportResponse)
async def export_dot(spec: GraphSpec) -> ExportResponse:
    try:
        model = _loader().load_model(spec.model_id)
    except ModelNotFoundError as exc:
        raise FeyngraphHTTPException(
            status_code=404,
            detail=f"Model '{spec.model_id}' not found",
            code="MODEL_NOT_FOUND",
        ) from exc
    try:
        dot = to_gammaloop_dot(spec, model)
    except UnassignedEdgeError as exc:
        raise FeyngraphHTTPException(status_code=422, detail=str(exc), code="UNASSIGNED_EDGES") from exc
    except NoExternalLegsError as exc:
        raise FeyngraphHTTPException(status_code=422, detail=str(exc), code="NO_EXTERNAL_LEGS") from exc
    except InvalidLoopOverrideError as exc:
        raise FeyngraphHTTPException(
            status_code=422,
            detail=str(exc),
            code="INVALID_LMB_OVERRIDE",
            hint="lmb_edge_ids must list chord edges (removing them must leave a spanning forest)",
        ) from exc

    warnings: list[str] = []
    try:
        theory = get_theory(spec.theory_id)
    except KeyError:
        theory = None
    if theory is not None:
        filtered = apply_theory(model, theory)
        allowed_pdgs = {p.pdg_id for p in filtered.particles}
        allowed_vertex_ids = {v.id for v in filtered.vertices}
        bad_pdgs = sorted({
            e.particle_pdg_id for e in spec.edges
            if e.particle_pdg_id is not None and e.particle_pdg_id not in allowed_pdgs
        })
        if bad_pdgs:
            warnings.append(
                f"Theory '{spec.theory_id}' does not contain particle(s) PDG {bad_pdgs}; "
                f"gammaloop import will likely fail."
            )
        bad_vtx = sorted({
            n.ufo_vertex_id for n in spec.nodes
            if n.ufo_vertex_id is not None and n.ufo_vertex_id not in allowed_vertex_ids
        })
        if bad_vtx:
            warnings.append(
                f"Theory '{spec.theory_id}' does not contain vertex/vertices {bad_vtx}; "
                f"gammaloop import will likely fail."
            )
    return ExportResponse(dot=dot, warnings=warnings)


class ExportBatchRequest(BaseModel):
    diagrams: list[GraphSpec]
    archive_name: str = "diagrams"


@router.post("/export-dot-batch")
async def export_dot_batch(req: ExportBatchRequest) -> Response:
    """Render each diagram to .dot and pack into a ZIP. Diagrams that fail
    to render are written as <name>.error.txt so the user still sees what
    happened. Theory warnings ride along in MANIFEST.txt."""
    if not req.diagrams:
        raise FeyngraphHTTPException(
            status_code=422, detail="No diagrams supplied", code="EMPTY_BATCH",
        )

    loader = _loader()
    model_cache: dict[str, object] = {}
    theory_cache: dict[str, object | None] = {}

    def model_for(model_id: str):
        if model_id not in model_cache:
            model_cache[model_id] = loader.load_model(model_id)
        return model_cache[model_id]

    def theory_for(theory_id: str):
        if theory_id not in theory_cache:
            try:
                theory_cache[theory_id] = get_theory(theory_id)
            except KeyError:
                theory_cache[theory_id] = None
        return theory_cache[theory_id]

    buf = io.BytesIO()
    manifest_lines: list[str] = [
        f"Batch export — {len(req.diagrams)} diagram(s)",
        "",
    ]
    used_names: set[str] = set()
    succeeded = 0

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, spec in enumerate(req.diagrams):
            base = (spec.process_name or f"diagram_{idx:03d}").strip() or f"diagram_{idx:03d}"
            base = _safe_filename(base)
            name = _unique_name(base, used_names)
            used_names.add(name)
            try:
                model = model_for(spec.model_id)
            except ModelNotFoundError:
                zf.writestr(f"{name}.error.txt", f"Model '{spec.model_id}' not found")
                manifest_lines.append(f"  ✗ {name}.dot — MODEL_NOT_FOUND ({spec.model_id})")
                continue
            try:
                dot = to_gammaloop_dot(spec, model)
            except (UnassignedEdgeError, NoExternalLegsError, InvalidLoopOverrideError) as exc:
                zf.writestr(f"{name}.error.txt", str(exc))
                manifest_lines.append(f"  ✗ {name}.dot — {type(exc).__name__}: {exc}")
                continue
            zf.writestr(f"{name}.dot", dot)
            succeeded += 1
            warnings: list[str] = []
            theory = theory_for(spec.theory_id)
            if theory is not None:
                filtered = apply_theory(model, theory)
                allowed_pdgs = {p.pdg_id for p in filtered.particles}
                allowed_vertex_ids = {v.id for v in filtered.vertices}
                bad_pdgs = sorted({
                    e.particle_pdg_id for e in spec.edges
                    if e.particle_pdg_id is not None and e.particle_pdg_id not in allowed_pdgs
                })
                if bad_pdgs:
                    warnings.append(f"particles {bad_pdgs} not in theory '{spec.theory_id}'")
                bad_vtx = sorted({
                    n.ufo_vertex_id for n in spec.nodes
                    if n.ufo_vertex_id is not None and n.ufo_vertex_id not in allowed_vertex_ids
                })
                if bad_vtx:
                    warnings.append(f"vertices {bad_vtx} not in theory '{spec.theory_id}'")
            if warnings:
                manifest_lines.append(f"  ! {name}.dot — warnings: {'; '.join(warnings)}")
            else:
                manifest_lines.append(f"  ✓ {name}.dot")

        manifest_lines.insert(1, f"{succeeded} succeeded, {len(req.diagrams) - succeeded} failed")
        manifest_lines.insert(2, "")
        zf.writestr("MANIFEST.txt", "\n".join(manifest_lines) + "\n")

    safe_archive = _safe_filename(req.archive_name) or "diagrams"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_archive}.zip"'},
    )


def _safe_filename(name: str) -> str:
    """Strip path separators and weird characters from a filename component."""
    out: list[str] = []
    for ch in name:
        if ch.isalnum() or ch in "-_":
            out.append(ch)
        elif ch in " /\\":
            out.append("_")
    cleaned = "".join(out).strip("_")
    return cleaned or "diagram"


def _unique_name(base: str, used: set[str]) -> str:
    if base not in used:
        return base
    i = 2
    while f"{base}_{i}" in used:
        i += 1
    return f"{base}_{i}"
