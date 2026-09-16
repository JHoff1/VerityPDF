import { useEffect, useState } from "react";
import { loadPdfRuntime } from "../lib/pdfRuntime";

export function CompressionPreview({ before, after, sample = false, includesEdits = false }: { before: Uint8Array; after: Uint8Array; sample?: boolean; includesEdits?: boolean }) {
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(1);
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(false);
  useEffect(() => {
    let stopped = false;
    const tasks: ReturnType<Awaited<ReturnType<typeof loadPdfRuntime>>["getDocument"]>[] = [];
    setImages([]); setError("");
    void (async () => {
      const runtime = await loadPdfRuntime();
      const output: string[] = [];
      for (const bytes of [before, after]) {
        if (stopped) return;
        const task = runtime.getDocument({ data: bytes.slice(), isEvalSupported: false });
        tasks.push(task);
        const pdf = await task.promise;
        if (stopped) return;
        setCount(sample ? 1 : pdf.numPages);
        const source = await pdf.getPage(Math.min(page, pdf.numPages));
        const size = source.getViewport({ scale: 1 });
        const viewport = source.getViewport({ scale: Math.min(2, 1600 / Math.max(size.width, size.height)) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await source.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        output.push(canvas.toDataURL("image/png"));
        canvas.width = canvas.height = 0;
      }
      if (!stopped) setImages(output);
    })().catch((cause) => { if (!stopped) setError(`Preview unavailable: ${String(cause)}`); })
      .finally(() => { for (const task of tasks) void task.destroy(); });
    return () => { stopped = true; for (const task of tasks) void task.destroy(); };
  }, [before, after, page, sample]);
  return <section className="mt-4 space-y-3" aria-label="Compression quality preview">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-white/15 px-3 py-2 disabled:opacity-40">Previous preview page</button>
      <span>Page {page} of {count}</span>
      <button type="button" disabled={page >= count} onClick={() => setPage(page + 1)} className="rounded border border-white/15 px-3 py-2 disabled:opacity-40">Next preview page</button>
      <label className="flex items-center gap-2"><input type="checkbox" checked={detail} onChange={(event) => setDetail(event.target.checked)} />Enlarge details</label>
    </div>
    <p className="text-xs text-zinc-400">{sample ? "First-page sample. " : "Compare the same page before saving. "}{includesEdits ? "Current form values and annotations are included." : "Preview shows PDF content; unsaved annotation overlays are not included."}</p>
    {error ? <p role="alert">{error}</p> : images.length === 2 ? <div className="grid grid-cols-2 gap-3">
      {images.map((src, index) => <figure key={index} className="min-w-0"><figcaption className="mb-2 text-sm font-semibold">{index ? "After compression" : "Original"}</figcaption><div className="max-h-96 overflow-auto rounded border border-white/15 bg-zinc-200"><img src={src} alt={`${index ? "Compressed" : "Original"} page ${page}`} className={detail ? "max-w-none" : "w-full"} style={detail ? { width: 800 } : undefined} /></div></figure>)}
    </div> : <p role="status">Rendering comparison…</p>}
  </section>;
}
