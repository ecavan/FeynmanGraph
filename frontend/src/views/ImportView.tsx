import { UfoUploader } from "../panels/UfoUploader";

export function ImportView() {
  return (
    <div data-testid="view-import" style={{ padding: 20, maxWidth: 720 }}>
      <UfoUploader />
    </div>
  );
}
