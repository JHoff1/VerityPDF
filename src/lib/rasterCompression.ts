import type { CompressionMode } from "./compressPdf";
import { assertCompressionAllowed } from "./compressPdf";
import { loadPdfRuntime } from "./pdfRuntime";

export type PageRendering = "preserve" | 200 | 300;
export type RasterResult = { bytes: Uint8Array; pageCount: number; processedPages: number; estimatedSize: number; sample: boolean };
const MAX_BYTES = 256 * 1024 * 1024;

export function rasterDimensions(width: number, height: number, dpi: number) {
  if (dpi !== 200 && dpi !== 300) throw new Error("Choose 200 or 300 DPI.");
  const pixels = { width: Math.ceil(width * dpi / 72), height: Math.ceil(height * dpi / 72) };
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0 || pixels.width * pixels.height > 32_000_000 || Math.max(pixels.width, pixels.height) > 16384) {
    throw new Error("A page is too large at this resolution. Choose a lower DPI or preserve the original pages.");
  }
  return pixels;
}

// This is a new image-only PDF, never a mutation of the source document.
export async function rasterCompressPdf(bytes: Uint8Array, mode: CompressionMode, dpi: 200 | 300, sample: boolean, signal: AbortSignal, progress: (message: string, estimatedSize?: number) => void = () => {}): Promise<RasterResult> {
  const check = () => { if (signal.aborted) throw new Error("Compression cancelled. Your original is unchanged."); };
  check();
  if (bytes.length > MAX_BYTES) throw new Error("Raster compression supports PDFs up to 256 MB.");
  progress("Checking document…");
  await assertCompressionAllowed(bytes);
  check();
  const { PDFDocument } = await import("pdf-lib");
  const runtime = await loadPdfRuntime();
  check();
  const task = runtime.getDocument({ data: bytes.slice(), isEvalSupported: false });
  const abort = () => { void task.destroy(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const source = await task.promise;
    if (source.numPages > 1000) throw new Error("Raster compression supports up to 1,000 pages. Extract a smaller range first.");
    const output = await PDFDocument.create();
    const count = sample ? 1 : source.numPages;
    let encodedBytes = 0;
    for (let number = 1; number <= count; number++) {
      check();
      progress(`Rendering page ${number} of ${source.numPages} at ${dpi} DPI…`);
      const page = await source.getPage(number);
      const size = page.getViewport({ scale: 1 });
      const dimensions = rasterDimensions(size.width, size.height, dpi);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement("canvas");
      try {
        canvas.width = dimensions.width; canvas.height = dimensions.height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Unable to create the page image.");
        const render = page.render({ canvasContext: context, viewport, background: "white" });
        const cancelRender = () => render.cancel();
        signal.addEventListener("abort", cancelRender, { once: true });
        try { await render.promise; } finally { signal.removeEventListener("abort", cancelRender); }
        check();
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Page image encoding failed.")), mode === "lossless" ? "image/png" : "image/jpeg", mode === "balanced" ? 0.82 : 0.58));
        check();
        encodedBytes += blob.size;
        if (encodedBytes > MAX_BYTES) throw new Error("Output exceeds 256 MB. Try stronger image compression or a lower DPI.");
        const data = await blob.arrayBuffer();
        const image = mode === "lossless" ? await output.embedPng(data) : await output.embedJpg(data);
        output.addPage([size.width, size.height]).drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
        progress(`Rendered ${number} of ${source.numPages} pages`, Math.round((encodedBytes / number + 1024) * source.numPages));
      } finally {
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    check();
    progress(sample ? "Preparing sample preview…" : "Writing rasterized copy…");
    const result = await output.save({ useObjectStreams: true, updateFieldAppearances: false });
    check();
    if (result.length > MAX_BYTES) throw new Error("Output exceeds 256 MB. Choose a lower DPI.");
    return { bytes: result, pageCount: source.numPages, processedPages: count, estimatedSize: Math.round(result.length / count * source.numPages), sample };
  } catch (cause) {
    check();
    throw cause;
  } finally {
    signal.removeEventListener("abort", abort);
    await task.destroy();
  }
}
