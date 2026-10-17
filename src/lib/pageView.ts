import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

// Logical page numbering can change without invalidating PDF.js page resources.
const originals = new WeakMap<PDFPageProxy, PDFPageProxy>();
const ids = new WeakMap<PDFPageProxy, number>();
let nextId = 0;
export function pageViewKey(page: PDFPageProxy) {
  const source = originalPage(page);
  if (!ids.has(source)) ids.set(source, ++nextId);
  return ids.get(source)!;
}
const views = new WeakMap<PDFPageProxy, Map<number, PDFPageProxy>>();
export function originalPage(page: PDFPageProxy) { return originals.get(page) ?? page; }
export function numberedPage(page: PDFPageProxy, pageNumber: number): PDFPageProxy {
  const source = originalPage(page);
  if (source.pageNumber === pageNumber) return source;
  let cached = views.get(source);
  if (!cached) { cached = new Map(); views.set(source, cached); }
  if (!cached.has(pageNumber)) cached.set(pageNumber, new Proxy(source, {
    get(target, property) {
      if (property === "pageNumber") return pageNumber;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  }));
  const view = cached.get(pageNumber)!;
  originals.set(view, source);
  return view;
}
export function documentView(source: PDFDocumentProxy, indices: number[]): PDFDocumentProxy {
  return new Proxy(source, {
    get(target, property) {
      if (property === "numPages") return indices.length;
      if (property === "getPage") return async (number: number) => {
        if (!indices[number - 1]) throw new Error("Page is outside the document.");
        return numberedPage(await target.getPage(indices[number - 1]), number);
      };
      if (property === "getPageIndex") return async (ref: Parameters<PDFDocumentProxy["getPageIndex"]>[0]) => {
        const index = indices.indexOf(await target.getPageIndex(ref) + 1);
        if (index < 0) throw new Error("Bookmark page was deleted.");
        return index;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
