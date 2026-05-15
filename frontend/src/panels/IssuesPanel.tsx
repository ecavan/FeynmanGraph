import { useEffect, useState } from "react";
import { ApiClient } from "../api/client";
import type { GraphIssue } from "../api/types";
import { useDiagramStore } from "../state/diagram";
import { serializeGraphSpec } from "./serialize";

const api = new ApiClient();

export function IssuesPanel() {
  const [issues, setIssues] = useState<GraphIssue[]>([]);
  const state = useDiagramStore();

  useEffect(() => {
    if (!state.modelId) {
      setIssues([]);
      return;
    }
    const spec = serializeGraphSpec(state);
    api
      .validateGraph(spec)
      .then((resp) => setIssues(resp.issues))
      .catch(() => setIssues([]));
  }, [state.modelId, state.theoryId, state.nodes, state.edges, state.externalLegs]);

  if (issues.length === 0) {
    return (
      <div data-testid="issues-panel">
        <h4>Issues</h4>
        <p style={{ opacity: 0.6 }}>No issues.</p>
      </div>
    );
  }

  return (
    <div data-testid="issues-panel">
      <h4>Issues ({issues.length})</h4>
      <ul style={{ paddingLeft: 16 }}>
        {issues.map((iss, i) => (
          <li key={i}>
            <strong>{iss.code}</strong>: {iss.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
