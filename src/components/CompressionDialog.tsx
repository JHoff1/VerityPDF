import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AppDialog } from "./AppDialog";
import { CompressionPreview } from "./CompressionPreview";
import { assertCompressionAllowed, compressPdf, type CompressionMode, type CompressionResult } from "../lib/compressPdf";
import { rasterCompressPdf, type PageRendering, type RasterResult } from "../lib/rasterCompression";

const modes: CompressionMode[] = ["lossless", "balanced", "smallest"];
const renderings: PageRendering[] = ["preserve", 200, 300];
const formatSize = (value: number) => value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(2)} MB` : `${(value / 1024).toFixed(2)} KB`;

function ThreePositionControl({ title, labels, value, onChange, disabled, children }: { title: string; labels: string[]; value: number; onChange: (value: number) => void; disabled: boolean; children: ReactNode }) {
  const id = useId();
  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="text-sm font-semibold">{title}</legend>
    <input id={id} type="range" aria-label={title} aria-valuetext={labels[value]} min={0} max={2} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className="block h-8 w-full cursor-pointer accent-orange-500" />
    <div className="grid grid-cols-3 gap-2">{labels.map((label, index) => <button type="button" key={label} aria-pressed={index === value} onClick={() => onChange(index)} className={`min-h-10 min-w-0 rounded-md border px-2 py-2 text-xs disabled:opacity-50 ${index === value ? "border-orange-500 bg-accent/10 text-orange-300" : "border-white/15 text-zinc-300 hover:bg-white/5"}`}>{label}</button>)}</div>
    <div className="rounded-lg bg-white/5 p-3 text-xs leading-5 text-zinc-400">{children}</div>
  </fieldset>;
}

export function CompressionDialog({ bytes: initialBytes, prepareRasterSource, onSaveCopy, onApply, onClose }: {
  bytes: Uint8Array; prepareRasterSource: () => Promise<Uint8Array | null>; onSaveCopy: (bytes: Uint8Array) => Promise<boolean>;
  onApply: (result: Uint8Array, original: Uint8Array) => void; onClose: () => void;
}) {
  // Pin callbacks and input to the document revision that opened this dialog.
  const [bytes] = useState(initialBytes);
  const sourceCallbacks = useRef({ prepareRasterSource, onSaveCopy });
  const rasterSource = useRef<Uint8Array | null>(null);
  const [mode, setMode] = useState<CompressionMode>("balanced");
  const [rendering, setRendering] = useState<PageRendering>("preserve");
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [raster, setRaster] = useState<RasterResult | null>(null);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const resetResult = () => { setResult(null); setRaster(null); setEstimatedSize(null); setError(""); setStatus(""); };
  const output = rendering === "preserve" ? result?.bytes : raster && !raster.sample ? raster.bytes : undefined;
  const smaller = Boolean(output && output.length < bytes.length);
  const locked = busy || saving;
  const rasterMode = rendering !== "preserve";

  const run = async (sample = false) => {
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); resetResult();
    try {
      if (rendering === "preserve") setResult(await compressPdf(bytes, mode, setStatus, () => abort.signal.aborted));
      else {
        if (!acknowledged) throw new Error("Acknowledge the image-only copy tradeoffs first.");
        if (!rasterSource.current) {
          setStatus("Preparing current form values and annotations…");
          await assertCompressionAllowed(bytes);
          const prepared = await sourceCallbacks.current.prepareRasterSource();
          if (!prepared) throw new Error("The document could not be prepared.");
          rasterSource.current = prepared;
        }
        const next = await rasterCompressPdf(rasterSource.current, mode, rendering, sample, abort.signal, (message, estimate) => { setStatus(message); if (estimate !== undefined) setEstimatedSize(estimate); });
        setRaster(next); setEstimatedSize(next.estimatedSize);
      }
      setStatus("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setStatus(""); setEstimatedSize(null); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!output) { await run(); return; }
    if (!smaller) { onClose(); return; }
    if (!rasterMode) { try { onApply(output, bytes); onClose(); } catch (cause) { setError(String(cause)); } return; }
    setSaving(true); setError("");
    try { if (await sourceCallbacks.current.onSaveCopy(output)) onClose(); else setStatus("Save cancelled. Your original is unchanged; the result is still available."); }
    catch (cause) { setError(String(cause)); } finally { setSaving(false); }
  };

  return <AppDialog title="Compress PDF" description="Compare size and quality locally. Your original disk file stays unchanged until you choose to save." wide busy={locked} confirmDisabled={rasterMode && !acknowledged} confirmLabel={output ? smaller ? rasterMode ? "Save rasterized copy" : "Apply compression" : "Keep original" : "Analyze and compress"} onCancel={onClose} onConfirm={confirm}>
    <div className="space-y-5">
      <ThreePositionControl title="Image & file compression" labels={["Lossless", "Balanced", "Strong"]} value={modes.indexOf(mode)} disabled={locked} onChange={(index) => { setMode(modes[index]); resetResult(); }}>
        {!rasterMode ? <p>{mode === "lossless" ? "Compact PDF structure without changing image quality." : mode === "balanced" ? "JPEG quality 82%; embedded images limited to a 2,400-pixel longest edge." : "JPEG quality 58%; embedded images limited to a 1,600-pixel longest edge."} Text and vectors remain sharp and selectable. Unsupported images are preserved.</p>
          : <p>{mode === "lossless" ? "PNG encoding preserves the rendered pixels, not the original vector detail. The file can grow." : mode === "balanced" ? "JPEG quality 82% for rendered pages. Inspect small symbols and fine lines." : "JPEG quality 58% for rendered pages. Fine lines may blur or show artifacts."} Resolution is controlled separately below.</p>}
      </ThreePositionControl>
      <ThreePositionControl title="Page rendering" labels={["Preserve original", "200 DPI", "300 DPI"]} value={renderings.indexOf(rendering)} disabled={locked} onChange={(index) => { setRendering(renderings[index]); setAcknowledged(false); resetResult(); }}>
        {!rasterMode ? <p>Keep vectors, selectable text, and interactive forms. Image-quality changes may not shrink vector-heavy PDFs.</p> : <p>{rendering === 200 ? "200 DPI favors a smaller copy; small symbols may soften." : "300 DPI favors sharper detail but uses more space."} Creates image-only pages: text will not be selectable, forms and annotations become permanent, and links, bookmarks, attachments, and original metadata are not carried over.</p>}
      </ThreePositionControl>
      {rasterMode && <label className="flex items-start gap-3 rounded-lg border border-orange-400/40 bg-accent/10 p-3 text-xs leading-5 text-orange-300"><input type="checkbox" disabled={locked} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 accent-orange-500" />I understand this creates an image-only copy and may reduce fine detail. Keep my original PDF unchanged.</label>}
      <section aria-label="Compression size comparison" className="rounded-lg border border-white/15 p-3 text-sm" aria-live="polite">
        <dl className="grid grid-cols-2 gap-2"><dt>Before</dt><dd>{formatSize(bytes.length)}</dd><dt>{output ? "After (measured)" : "Estimated output"}</dt><dd>{output ? formatSize(output.length) : estimatedSize !== null ? `About ${formatSize(estimatedSize)}` : "Not measured yet"}</dd>{output && <><dt>Reduction</dt><dd>{smaller ? `${((1 - output.length / bytes.length) * 100).toFixed(1)}%` : "No savings — original kept"}</dd></>}</dl>
        {!output && <p className="mt-2 text-xs text-zinc-400">{rasterMode ? estimatedSize !== null ? "Approximate extrapolation from rendered pages; page complexity varies. Generate the full PDF to measure the actual size." : "Estimate from the first page, or analyze the full document. No guessed size is shown." : "Analyze the document to measure the output. Structural and image savings vary by PDF."}</p>}
        {result && !rasterMode && <div className="mt-3 space-y-1 text-xs text-zinc-400">
          <p>{result.imagesCompressed} {result.imagesCompressed === 1 ? "image" : "images"} compressed; {result.imagesSkipped} left unchanged.</p>
          {result.imagesTotal === 0 && <p>No embedded raster images were found. Image quality cannot reduce detailed vector drawing commands; try a rasterized copy if loss of vector detail is acceptable.</p>}
          {mode === "lossless" && <p>Lossless compacts structure only. Already compact files may not shrink.</p>}
          {result.imagesAlreadySmall > 0 && <p>{result.imagesAlreadySmall} image(s) were already smaller than the recompressed version.</p>}
          {result.imagesUnsupported > 0 && <p>{result.imagesUnsupported} image(s) preserved: transparency, unsupported encoding/colors, size limits, or decoding limitations.</p>}
        </div>}
        {output && <p className="mt-2 text-xs text-zinc-400">{!smaller ? "This result will not replace your document. Try another setting." : rasterMode ? "Save to a new filename. The open document and its history stay unchanged." : "Apply, then save when satisfied. Undo restores the original."}</p>}
      </section>
      {rasterMode && !output && <button type="button" disabled={locked || !acknowledged} className="rounded-md border border-white/15 px-3 py-2 text-sm disabled:opacity-40" onClick={() => void run(true)}>Estimate & preview first page</button>}
      {raster?.sample && <p role="status" className="text-xs text-zinc-400">First-page sample only ({formatSize(raster.bytes.length)}); estimate covers {raster.pageCount} pages. Use Analyze and compress to generate all pages before saving.</p>}
      {(output || raster?.sample) && <CompressionPreview key={`${mode}-${rendering}-${raster?.sample}`} before={rasterMode ? rasterSource.current! : bytes} after={output ?? raster!.bytes} sample={Boolean(raster?.sample)} includesEdits={rasterMode} />}
    </div>
    {status && <p role="status" className="mt-3 text-sm">{status}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {busy && <button type="button" className="mt-3 rounded border border-white/15 px-3 py-2 text-sm" onClick={() => controller.current?.abort()}>Stop compression</button>}
  </AppDialog>;
}
