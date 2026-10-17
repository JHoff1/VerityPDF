import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { documentView, numberedPage, originalPage, pageViewKey } from "../../src/lib/pageView";
import { pngArchive } from "../../src/lib/conversion";

describe("retained page views", () => {
  it("renumbers without changing source resource identity", () => {
    const page = { pageNumber: 5, getViewport() { return this.pageNumber; } } as unknown as PDFPageProxy;
    const view = numberedPage(page, 2);
    expect(view.pageNumber).toBe(2);
    expect(view.getViewport({ scale: 1 })).toBe(5);
    expect(originalPage(view)).toBe(page);
    expect(numberedPage(page, 2)).toBe(view);
    expect(pageViewKey(view)).toBe(pageViewKey(page));
  });
  it("maps page and bookmark lookups, rejecting deleted destinations", async () => {
    const pages = [1, 2, 3].map((pageNumber) => ({ pageNumber } as PDFPageProxy));
    const source = { numPages: 3, getPage: vi.fn(async (number: number) => pages[number - 1]), getPageIndex: vi.fn(async (ref: { num: number }) => ref.num - 1) } as unknown as PDFDocumentProxy;
    const view = documentView(source, [1, 3]);
    expect(view.numPages).toBe(2);
    expect(originalPage(await view.getPage(2))).toBe(pages[2]);
    expect(await view.getPageIndex({ num: 3, gen: 0 })).toBe(1);
    await expect(view.getPageIndex({ num: 2, gen: 0 })).rejects.toThrow("deleted");
    await expect(view.getPage(3)).rejects.toThrow("outside");
  });
});

it("writes ZIP headers, standard CRC32, payload and central directory", async () => {
  const payload = new TextEncoder().encode("123456789");
  const archive = new Uint8Array(await pngArchive([{ name: "page-0001.png", bytes: payload }]).arrayBuffer());
  const view = new DataView(archive.buffer);
  expect(view.getUint32(14, true)).toBe(0xcbf43926);
  const length = view.getUint16(26, true);
  expect(archive.slice(30 + length, 30 + length + payload.length)).toEqual(payload);
  expect(view.getUint32(30 + length + payload.length, true)).toBe(0x02014b50);
  expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
});
