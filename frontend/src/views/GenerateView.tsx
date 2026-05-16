import { GeneratePanel } from "../panels/GeneratePanel";

export function GenerateView(props: { onLoad?: () => void }) {
  return (
    <div data-testid="view-generate" style={{ padding: 20, maxWidth: 720 }}>
      <GeneratePanel onLoad={props.onLoad} />
    </div>
  );
}
