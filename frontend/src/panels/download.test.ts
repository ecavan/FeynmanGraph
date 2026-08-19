import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "./download";

afterEach(() => vi.restoreAllMocks());

describe("downloadText", () => {
  it("saves the full content as a named text file (blob URL + anchor click)", async () => {
    const createURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeURL = vi.fn();
    // jsdom doesn't implement the object-URL API — install spies.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL =
      createURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL =
      revokeURL;

    let anchor: HTMLAnchorElement | null = null;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") anchor = el as HTMLAnchorElement;
      return el;
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadText("reduction.txt", "FULL-UNTRUNCATED-EXPRESSION");

    // a Blob carrying exactly the content, typed as text
    expect(createURL).toHaveBeenCalledTimes(1);
    const blob = createURL.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain("text/plain");
    // jsdom's Blob has no .text(); read it back through FileReader instead.
    const text = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsText(blob);
    });
    expect(text).toBe("FULL-UNTRUNCATED-EXPRESSION");

    // an anchor with the download filename, clicked, then cleaned up
    expect(anchor?.download).toBe("reduction.txt");
    expect(anchor?.href).toBe("blob:mock-url");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
