// Client-side gate + backend-reason mapping for the "Reduce to masters" action.
// The one-loop reducer only handles single-loop diagrams; rather than let the
// backend return a scary error, we warn the user up front (loop count is known
// from the loop-momentum basis) and map any backend status to a friendly note.

/** Returns a warning string if the diagram can't be reduced (loop count != 1),
 *  or null when it's a one-loop diagram that should reduce. */
export function reduceLoopGuard(loopCount: number): string | null {
  if (loopCount === 1) return null;
  const plural = loopCount === 1 ? "" : "s";
  return `Reduce to masters only works for one-loop diagrams — this diagram has ${loopCount} loop${plural}.`;
}

/** Whether to auto-load the numerator on diagram select. Only for tree (0) and
 *  one-loop (1) diagrams — a ≥2-loop numerator is too heavy to fetch eagerly, so
 *  those are left to a manual "Load numerator" click. */
export function shouldAutoLoadNumerator(loopCount: number): boolean {
  return Number.isFinite(loopCount) && loopCount >= 0 && loopCount < 2;
}

/** Maps a backend `reduce_status` (surfaced via the API) to a user-facing
 *  warning, or null when there is no known status (fall back to normal error). */
export function reduceReasonMessage(
  status: string | null | undefined,
): string | null {
  switch (status) {
    case "not_one_loop":
      return "Reduce to masters only works for one-loop diagrams.";
    case "zero_numerator":
      return "This diagram vanishes identically — its numerator is zero, so there is nothing to reduce.";
    case "unsupported":
      return "This one-loop diagram isn't supported by the reducer yet.";
    default:
      return null;
  }
}

/** Truncate a very large source string for display in a `<pre>`, so the browser
 *  doesn't stall laying out megabytes of text (some reductions are multi-MB). */
export function clampForDisplay(s: string, max = 40000): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n… [truncated — ${s.length.toLocaleString()} characters total]`;
}

/** The reducer prints master integrals and invariants with function-call syntax
 *  (`B0(...)`, `dot(a,b)`) and flat momenta (`q1`) that Typst math misreads as
 *  undefined variables / function calls. Rewrite to valid Typst math:
 *  `dot(a,b)` → `(a dot b)`, `B0(` → `B_0 (`, `q1` → `q_(1)`. Validated against
 *  the real reducer output with the Typst compiler. */
export function sanitizeReducedTypst(raw: string): string {
  return (
    raw
      .replace(/dot\(([^(),]+),\s*([^(),]+)\)/g, "($1 dot $2)")
      .replace(/\b([ABCD])0\(/g, "$1_0 (")
      .replace(/\bq(\d+)/g, "q_($1)")
      // Quote any residual bare multi-letter identifier (Tr, ZERO, in, out, …)
      // that Typst math would otherwise read as an undefined variable. Skip
      // already-quoted strings and the `dot` operator. Lookarounds (not \b) so a
      // trailing unicode superscript like `ZERO²` still matches. Validated across
      // 43 diagrams (bubble/triangle/box, open + closed fermion lines) with the
      // Typst compiler.
      .replace(
        /"[^"]*"|(?<![A-Za-z])([A-Za-z]{2,})(?![A-Za-z])/g,
        (m: string, id: string) =>
          m[0] === '"' ? m : id === "dot" ? m : `"${id}"`,
      )
  );
}
