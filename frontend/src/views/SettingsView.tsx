import { ExampleLoader } from "../panels/ExampleLoader";
import { ModelPanel } from "../panels/ModelPanel";
import { TheoryPicker } from "../panels/TheoryPicker";

export function SettingsView() {
  return (
    <div data-testid="view-settings" style={{ padding: 16 }}>
      <ModelPanel />
      <TheoryPicker />
      <ExampleLoader />
    </div>
  );
}
