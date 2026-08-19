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

/** Maps a backend `reduce_status` (surfaced via the API) to a user-facing
 *  warning, or null when there is no known status (fall back to normal error). */
export function reduceReasonMessage(status: string | null | undefined): string | null {
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
