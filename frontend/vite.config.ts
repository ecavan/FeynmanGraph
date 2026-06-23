import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const normalizeBase = (value: string | undefined) => {
  const raw = value && value.trim() ? value.trim() : "/";
  if (raw === "." || raw === "./") return "./";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
};

export default defineConfig({
  base: normalizeBase(process.env.FEYNGRAPH_FRONTEND_BASE),
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  optimizeDeps: {
    include: [
      "@myriaddreamin/typst.ts",
      "@myriaddreamin/typst-ts-web-compiler",
      "@myriaddreamin/typst-ts-renderer",
    ],
    exclude: [
      "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
      "@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["node_modules/**", "e2e/**"],
  },
});
