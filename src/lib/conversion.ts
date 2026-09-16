import { parsePageRanges } from "../localUtils";
import { loadPdfRuntime } from "./pdfRuntime";

export type ConversionFile = { name: string; bytes: Uint8Array };
export const MAX_CONVERSION_BYTES = 256 * 1024 * 1024;

// PNGs are already compressed. A stored ZIP avoids another large compression buffer.
export function pngArchive(files: ConversionFile[]) {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    let crc = 0xffffffff;
    for (const byte of file.bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length);
    const local = new DataView(header.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x800, true);
    local.setUint16(12, 33, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, file.bytes.length, true);
    local.setUint32(22, file.bytes.length, true);
    local.setUint16(26, name.length, true);
    header.set(name, 30);
    const entry = new Uint8Array(46 + name.length);
    const central = new DataView(entry.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x800, true);
    central.setUint16(14, 33, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, file.bytes.length, true);
    central.setUint32(24, file.bytes.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    entry.set(name, 46);
    directory.push(entry);
    parts.push(header, file.bytes);
    offset += header.length + file.bytes.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end] as BlobPart[], { type: "application/zip" });
}

export async function pngsToPdf(files: ConversionFile[], size: "image" | "a4" | "letter", progress: (message: string) => void, cancelled: () => boolean) {
  if (!files.length) throw new Error("Choose at least one PNG image.");
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (const [index, file] of files.entries()) {
    if (cancelled()) throw new Error("Conversion cancelled. No output was saved.");
    progress(`Adding image ${index + 1} of ${files.length}`);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    const image = await pdf.embedPng(file.bytes);
    const [width, height] = size === "a4" ? [595.28, 841.89] : size === "letter" ? [612, 792] : [image.width * 0.75, image.height * 0.75];
    const page = pdf.addPage([width, height]);
    const margin = size === "image" ? 0 : 24;
    const scale = Math.min((width - margin * 2) / image.width, (height - margin * 2) / image.height);
    page.drawImage(image, { x: (width - image.width * scale) / 2, y: (height - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}

export async function pdfToPngs(bytes: Uint8Array, range: string, dpi: number, progress: (message: string) => void, cancelled: () => boolean) {
  const runtime = await loadPdfRuntime();
  const task = runtime.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const selected = range.trim() ? parsePageRanges(range, pdf.numPages) : { pages: Array.from({ length: pdf.numPages }, (_, index) => index + 1), error: "" };
    if (selected.error) throw new Error(selected.error);
    if (selected.pages.length > 1000) throw new Error("Export up to 1,000 pages at a time using a page range.");
    const files: ConversionFile[] = [];
    let totalBytes = 0;
    for (const [index, number] of selected.pages.entries()) {
      if (cancelled()) throw new Error("Conversion cancelled. No output was saved.");
      progress(`Rendering page ${number} (${index + 1} of ${selected.pages.length})`);
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: dpi / 72 });
      if (viewport.width * viewport.height > 32_000_000 || Math.max(viewport.width, viewport.height) > 16384) throw new Error(`Page ${number} is too large at this resolution. Choose a lower DPI.`);
      const canvas = document.createElement("canvas");
      try {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Unable to create an image canvas.");
        await page.render({ canvasContext: context, viewport, background: "white" }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG encoding failed.")), "image/png"));
        totalBytes += blob.size;
        if (totalBytes > MAX_CONVERSION_BYTES) throw new Error("The export exceeds 256 MB. Choose fewer pages or a lower DPI.");
        files.push({ name: `page-${String(number).padStart(4, "0")}.png`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      } finally {
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
    }
    return files;
  } finally {
    await task.destroy();
  }
}
