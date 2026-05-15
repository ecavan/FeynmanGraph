import { ExampleLoader } from "../panels/ExampleLoader";
import { ModelPicker } from "../panels/ModelPicker";

export function SetupView() {
  return (
    <div data-testid="view-setup" style={{ padding: 20, maxWidth: 720 }}>
      <ModelPicker />
      <hr style={{ margin: "20px 0" }} />
      <ExampleLoader />
      <p style={{ fontSize: 12, opacity: 0.65, marginTop: 12 }}>
        Theory is set on the Canvas tab — it filters the particle palette
        when you're building a diagram.
      </p>
    </div>
  );
}
