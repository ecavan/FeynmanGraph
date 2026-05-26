import { useEffect, useState } from "react";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; svg: string }
  | { kind: "error"; message: string };

// Typst's math parser rejects letters with combining diacritics; substitute the
// corresponding macros (bar/tilde/hat) before passing through.
const COMBINING = [
  [/(\S)̅/g, "bar($1)"],
  [/(\S)̄/g, "bar($1)"],
  [/(\S)̃/g, "tilde($1)"],
  [/(\S)̂/g, "hat($1)"],
] as const;

function wrap(source: string): string {
  const safe = COMBINING.reduce((s, [re, rep]) => s.replace(re, rep), source);
  return `
#set page(width: auto, height: auto, margin: 8pt, fill: white)
#set text(size: 16pt)
$ ${safe} $
`;
}

type Compiler = {
  addSource: (path: string, source: string) => void;
  compile: (opts: object) => Promise<{ result?: Uint8Array; diagnostics?: unknown }>;
  reset?: () => Promise<void> | void;
  init: (opts: { getModule: () => string; beforeBuild?: unknown[] }) => Promise<void>;
};
type Renderer = {
  renderSvg: (opts: { artifactContent: Uint8Array }) => Promise<string>;
  init: (opts: { getModule: () => string }) => Promise<void>;
};
type TypstModule = {
  createTypstCompiler: () => Compiler;
  createTypstRenderer: () => Renderer;
  preloadRemoteFonts: (urls: string[]) => unknown;
};

const FONT_CDN = "https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.13.1/files/fonts";
const FONTS = [
  `${FONT_CDN}/NewCMMath-Regular.otf`,
  `${FONT_CDN}/NewCM10-Regular.otf`,
  `${FONT_CDN}/NewCM10-Italic.otf`,
];

let compilerReady: Promise<Compiler> | null = null;
let rendererReady: Promise<Renderer> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function loadTypst(): Promise<TypstModule> {
  return (await import("@myriaddreamin/typst.ts")) as unknown as TypstModule;
}

async function getCompiler() {
  if (compilerReady) return compilerReady;
  compilerReady = (async () => {
    const typst = await loadTypst();
    const wasm = (await import("@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url")).default;
    const c = typst.createTypstCompiler();
    await c.init({ getModule: () => wasm, beforeBuild: [typst.preloadRemoteFonts(FONTS)] });
    return c;
  })();
  return compilerReady;
}

async function getRenderer() {
  if (rendererReady) return rendererReady;
  rendererReady = (async () => {
    const typst = await loadTypst();
    const wasm = (await import("@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url")).default;
    const r = typst.createTypstRenderer();
    await r.init({ getModule: () => wasm });
    return r;
  })();
  return rendererReady;
}

async function renderTypst(source: string): Promise<string> {
  const run = async () => {
    const [c, r] = await Promise.all([getCompiler(), getRenderer()]);
    await c.reset?.();
    c.addSource("/main.typ", wrap(source));
    const out = await c.compile({ format: "vector", mainFilePath: "/main.typ", diagnostics: "full" });
    if (!out.result) {
      const diag = out.diagnostics as { diagnostics?: { message?: string }[] } | undefined;
      const msgs = diag?.diagnostics?.map((d) => d.message ?? JSON.stringify(d)) ?? [JSON.stringify(diag ?? {})];
      throw new Error(`Typst compile failed — ${msgs.slice(0, 3).join(" | ")}`);
    }
    return r.renderSvg({ artifactContent: out.result });
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next as Promise<string>;
}

export function TypstMath({ source }: { source: string }) {
  const [state, setState] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    renderTypst(source)
      .then((svg) => { if (!cancelled) setState({ kind: "ready", svg }); })
      .catch((e: Error) => { if (!cancelled) setState({ kind: "error", message: e.message }); });
    return () => { cancelled = true; };
  }, [source]);

  if (state.kind === "loading") {
    return <div style={{ fontSize: 12, opacity: 0.55, padding: "8px 0" }}>Rendering math…</div>;
  }
  if (state.kind === "error") {
    return (
      <div
        style={{
          padding: "6px 8px", background: "#fde2e1", border: "1px solid #c0392b",
          color: "#7a1c12", borderRadius: 3, fontSize: 11,
        }}
      >
        Math render failed: {state.message}
      </div>
    );
  }
  return (
    <div
      data-testid="typst-svg"
      style={{
        padding: "12px 16px", background: "white", border: "1px solid #e0e0e0",
        borderRadius: 4, overflow: "auto", textAlign: "center", maxHeight: 260,
      }}
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
