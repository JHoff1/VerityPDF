import { afterEach, expect, it, vi } from "vitest";
import { checkPngDimensions, MAX_CONVERSION_BYTES, pdfToPngs, pngsToPdf, readConversionFiles } from "../../src/lib/conversion";

const runtime = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("../../src/lib/pdfRuntime", () => ({ loadPdfRuntime: async () => runtime }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("rejects oversized selections before reading any file, including previously selected input", async () => {
  const read = vi.fn(async () => new Uint8Array(1));
  await expect(readConversionFiles([{ name: "large.png", size: MAX_CONVERSION_BYTES + 1, read }])).rejects.toThrow("256 MB");
  await expect(readConversionFiles([{ name: "large.png", size: MAX_CONVERSION_BYTES, read }], [{ name: "existing.png", bytes: new Uint8Array(1) }])).rejects.toThrow("256 MB");
  await expect(readConversionFiles(Array.from({ length: 1001 }, () => ({ name: "tiny.png", size: 1, read })))).rejects.toThrow("1,000");
  expect(read).not.toHaveBeenCalled();
});

it("checks actual contents if a file grew since preflight", async () => {
  const chosen = await readConversionFiles([{ name: "one.png", size: 1, read: async () => new Uint8Array([1, 2]) }]);
  expect(chosen[0].bytes).toEqual(new Uint8Array([1, 2]));
  await expect(readConversionFiles([{ name: "two.png", size: 1, read: async () => new Uint8Array(2) }], [{ name: "existing.png", bytes: { length: MAX_CONVERSION_BYTES - 1 } as Uint8Array }])).rejects.toThrow("256 MB");
});

it("rejects PNG dimensions before attempting decompression", async () => {
  const header = new Uint8Array(33);
  header.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(header.buffer);
  view.setUint32(16, 20000); view.setUint32(20, 20000);
  expect(() => checkPngDimensions(header)).toThrow("too large");
  await expect(pngsToPdf([{ name: "huge.png", bytes: header }], "image", () => {}, () => false)).rejects.toThrow("too large");
  expect(() => checkPngDimensions(new Uint8Array(33))).toThrow("valid PNG");
  view.setUint32(16, 30); view.setUint32(20, 60);
  expect(() => checkPngDimensions(header)).not.toThrow();
});

it("cancels an active PDF render and releases its canvas, page and document", async () => {
  const controller = new AbortController();
  let rejectRender!: (error: Error) => void;
  const cancel = vi.fn(() => rejectRender(new Error("Rendering cancelled")));
  const cleanup = vi.fn(); const destroy = vi.fn(async () => {});
  const canvas = { width: 0, height: 0, getContext: () => ({}) };
  vi.stubGlobal("document", { createElement: () => canvas });
  runtime.getDocument.mockReturnValue({ destroy, promise: Promise.resolve({ numPages: 1, getPage: async () => ({
    getViewport: () => ({ width: 100, height: 100 }), cleanup,
    render: () => {
      const promise = new Promise<void>((_resolve, reject) => { rejectRender = reject; });
      queueMicrotask(() => controller.abort());
      return { promise, cancel };
    }
  }) }) });
  await expect(pdfToPngs(new Uint8Array(1), "", 72, () => {}, () => false, controller.signal)).rejects.toThrow("Conversion cancelled");
  expect(cancel).toHaveBeenCalledOnce();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalled();
  expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
});
