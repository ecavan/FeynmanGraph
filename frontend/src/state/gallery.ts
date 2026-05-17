import { create } from "zustand";
import type { ExampleSpec } from "../api/types";

export type GalleryState = {
  diagrams: ExampleSpec[];
  count: number;
  truncated: boolean;
  archiveName: string;
  loadedSpecId: string | null;

  setResult: (r: {
    diagrams: ExampleSpec[];
    count: number;
    truncated: boolean;
    archiveName: string;
  }) => void;
  setLoaded: (id: string | null) => void;
  clear: () => void;
};

const INITIAL = {
  diagrams: [] as ExampleSpec[],
  count: 0,
  truncated: false,
  archiveName: "diagrams",
  loadedSpecId: null as string | null,
};

export const useGalleryStore = create<GalleryState>((set) => ({
  ...INITIAL,
  setResult: (r) => set({ ...r, loadedSpecId: null }),
  setLoaded: (id) => set({ loadedSpecId: id }),
  clear: () => set(INITIAL),
}));
