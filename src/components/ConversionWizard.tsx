import { useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { AppDialog } from "./AppDialog";
import { MAX_CONVERSION_BYTES, pdfToPngs, pngArchive, pngsToPdf, type ConversionFile } from "../lib/conversion";

export function ConversionWizard({ currentName, getCurrentPdf, writePdf, onClose }: {
  currentName?: string;
  getCurrentPdf: () => Promise<Uint8Array | null>;
  writePdf: (path: string, bytes: Uint8Array) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"pdf" | "png">("pdf");
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<ConversionFile[]>([]);
  const [useCurrent, setUseCurrent] = useState(Boolean(currentName));
  const [range, setRange] = useState("");
  const [dpi, setDpi] = useState(144);
  const [size, setSize] = useState<"image" | "a4" | "letter">("image");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const button = "rounded border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
  const field = "mt-1 w-full rounded border border-white/15 bg-[#15171b] p-2 text-sm text-zinc-100 placeholder:text-zinc-500";

  const acceptFiles = (chosen: ConversionFile[]) => {
    const next = mode === "png" ? [...files, ...chosen] : chosen.slice(0, 1);
    if (next.reduce((sum, file) => sum + file.bytes.length, 0) > MAX_CONVERSION_BYTES || next.length > 1000) throw new Error("Choose up to 1,000 images and 256 MB of input files.");
    setFiles(next);
    setUseCurrent(false);
    setStatus("");
  };
  const choose = async () => {
    setError("");
    if (!isTauri()) { input.current?.click(); return; }
    try {
      const paths = await open({ multiple: mode === "png", filters: [{ name: mode === "png" ? "PNG images" : "PDF document", extensions: [mode] }] });
      if (!paths) return;
      const chosen: ConversionFile[] = [];
      for (const path of typeof paths === "string" ? [paths] : paths) chosen.push({ name: path.split(/[\\/]/).pop()!, bytes: await readFile(path) });
      acceptFiles(chosen);
    } catch (cause) { setError(String(cause)); }
  };
  const convert = async () => {
    setBusy(true); setError(""); cancelled.current = false;
    try {
      let blob: Blob;
      let name: string;
      setStatus("Preparing conversion…");
      if (mode === "png") {
        blob = await pngsToPdf(files, size, setStatus, () => cancelled.current);
        name = "converted-images.pdf";
      } else {
        const bytes = useCurrent ? await getCurrentPdf() : files[0]?.bytes;
        if (!bytes) throw new Error("Choose a PDF first.");
        const images = await pdfToPngs(bytes, range, dpi, setStatus, () => cancelled.current);
        blob = images.length === 1 ? new Blob([new Uint8Array(images[0].bytes)], { type: "image/png" }) : pngArchive(images);
        const base = (useCurrent ? currentName! : files[0].name).replace(/\.pdf$/i, "");
        name = `${base}${images.length === 1 ? "-" + images[0].name : "-pages.zip"}`;
      }
      if (cancelled.current) throw new Error("Conversion cancelled. No output was saved.");
      if (isTauri()) {
        const extension = name.split(".").pop()!;
        const path = await save({ defaultPath: name, filters: [{ name: "Converted file", extensions: [extension] }] });
        if (!path) { setStatus("Save cancelled. Your original files are unchanged."); return; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (mode === "png") await writePdf(path, bytes);
        else await writeFile(path, bytes);
        setStatus(`Saved ${name}. Your original files are unchanged.`);
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = name; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setStatus(`Download ready: ${name}. Your original files are unchanged.`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setStatus(""); }
    finally { setBusy(false); }
  };
  return <AppDialog title="Convert PDF / PNG" description={`Step ${step} of 2 · Files are processed entirely on your device.`} wide busy={busy} confirmLabel={step === 1 ? "Next" : "Convert and save"} confirmDisabled={step === 1 && !(mode === "pdf" && useCurrent || files.length)} onConfirm={step === 1 ? () => setStep(2) : convert} onCancel={onClose}>
    <fieldset disabled={busy} className="space-y-4">
      {step === 1 ? <>
        <div className="flex gap-2" role="group" aria-label="Conversion direction">
          {(["pdf", "png"] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value} className={`${button} ${mode === value ? "bg-accent/20 border-orange-500" : ""}`} onClick={() => { setMode(value); setFiles([]); setUseCurrent(value === "pdf" && Boolean(currentName)); setError(""); setStatus(""); }}>{value === "pdf" ? "PDF to PNG" : "PNG to PDF"}</button>)}
        </div>
        {mode === "pdf" && currentName && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useCurrent} onChange={(event) => setUseCurrent(event.target.checked)} />Use open document: {currentName}</label>}
        <button type="button" className={button} onClick={() => void choose()}>{mode === "png" ? "Add PNG images" : "Choose another PDF"}</button>
        <input ref={input} type="file" hidden aria-label="Conversion files" accept={mode === "png" ? "image/png,.png" : ".pdf"} multiple={mode === "png"} onChange={(event) => { const chosen = [...(event.target.files ?? [])]; event.target.value = ""; void (async () => { try { if (chosen.reduce((sum, file) => sum + file.size, 0) > MAX_CONVERSION_BYTES) throw new Error("Input exceeds 256 MB."); acceptFiles(await Promise.all(chosen.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })))); } catch (cause) { setError(String(cause)); } })(); }} />
        {!useCurrent && <ol className="space-y-2">{files.map((file, index) => <li key={index} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{index + 1}. {file.name}</span>{mode === "png" && <><button type="button" className={button} aria-label={`Move image ${index + 1} earlier`} disabled={!index} onClick={() => setFiles((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button type="button" className={button} aria-label={`Remove image ${index + 1}`} onClick={() => setFiles(files.filter((_, i) => i !== index))}>Remove</button></>}</li>)}</ol>}
        <p className="text-xs text-zinc-400">{mode === "pdf" ? "One page saves as PNG; multiple pages save together in a ZIP. Open-document annotations and form values are included." : "Each image becomes one page, in the order shown. Images are fitted without cropping."}</p>
      </> : <>
        <button type="button" className={button} onClick={() => { setStep(1); setStatus(""); setError(""); }}>Back</button>
        {mode === "pdf" ? <>
          <label className="block text-sm">Pages (blank means all)<input className={field} placeholder="1-3,5" value={range} onChange={(event) => setRange(event.target.value)} /></label>
          <label className="block text-sm">Resolution<select aria-label="Resolution" className={field} value={dpi} onChange={(event) => setDpi(Number(event.target.value))}>{[72, 144, 200, 300].map((value) => <option key={value} value={value}>{value} DPI</option>)}</select></label>
          <p className="text-xs text-zinc-400">PNG images are flattened pictures: text and form fields will no longer be editable. Higher DPI produces larger files.</p>
        </> : <label className="block text-sm">PDF page size<select className={field} value={size} onChange={(event) => setSize(event.target.value as typeof size)}><option value="image">Match image (96 pixels per inch)</option><option value="a4">A4 portrait</option><option value="letter">US Letter portrait</option></select></label>}
      </>}
    </fieldset>
    {status && <p role="status" className="mt-4 text-sm text-zinc-300">{status}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {busy && <button type="button" className={`${button} mt-3`} onClick={() => { cancelled.current = true; setStatus("Stopping after the current page…"); }}>Stop conversion</button>}
  </AppDialog>;
}
