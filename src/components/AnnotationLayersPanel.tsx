import { Eye, Image, Lock, PenLine, ScanLine, Type, Unlock, X } from "lucide-react";
import type { Annotation } from "../editor/useDocumentEditor";

const layerIcon = (annotation: Annotation) => {
  if (annotation.kind === "image") return <Image size={14} />;
  if (annotation.kind === "text") return <Type size={14} />;
  if (annotation.kind === "redaction") return <ScanLine size={14} />;
  return <PenLine size={14} />;
};

const layerLabel = (annotation: Annotation, index: number) => {
  if (annotation.kind === "text") return annotation.text.trim() || "Text box";
  if (annotation.kind === "image") return "Image";
  if (annotation.kind === "redaction") return "Secure redaction";
  return `${annotation.kind === "highlight" ? "Highlight" : "Pen stroke"} ${index + 1}`;
};

export function AnnotationLayersPanel({
  annotations,
  selectedIds,
  onSelect,
  onToggleLock,
  onRemove
}: {
  annotations: Annotation[];
  selectedIds: Set<string>;
  onSelect: (id: string, additive?: boolean) => void;
  onToggleLock: (annotation: Annotation) => void;
  onRemove: (id: string) => void;
}) {
  const ordered = [...annotations].reverse();
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] leading-4 text-zinc-500">
        {annotations.length ? "Top-most annotations are listed first." : "No annotations on the selected page."}
      </p>
      {ordered.map((annotation, index) => (
        <div
          key={annotation.id}
          className={`group flex items-center gap-2 rounded-lg border p-2 transition ${selectedIds.has(annotation.id) ? "border-orange-500 bg-orange-500/10" : "border-white/10 bg-white/[0.025] hover:border-zinc-500"}`}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-zinc-200"
            onClick={(event) => onSelect(annotation.id, event.ctrlKey || event.metaKey)}
            aria-pressed={selectedIds.has(annotation.id)}
            aria-label={`Select ${annotation.kind} annotation: ${layerLabel(annotation, index)}`}
          >
            <span className="text-orange-300">{layerIcon(annotation)}</span>
            <span className="min-w-0 flex-1 truncate">{layerLabel(annotation, index)}</span>
            <Eye size={13} className="text-zinc-500" aria-hidden="true" />
          </button>
          <button type="button" className="rounded p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-100" onClick={() => onToggleLock(annotation)} aria-label={annotation.locked ? "Unlock annotation" : "Lock annotation"}>{annotation.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
          <button type="button" className="rounded p-1.5 text-zinc-500 hover:bg-red-500/15 hover:text-red-300" onClick={() => onRemove(annotation.id)} aria-label="Delete annotation"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}
