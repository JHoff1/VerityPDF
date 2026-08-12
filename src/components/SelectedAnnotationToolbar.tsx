import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Crop,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  RotateCw,
  Trash2
} from "lucide-react";
import type { Annotation, TextStyle } from "../editor/useDocumentEditor";

export function SelectedAnnotationToolbar({
  annotation,
  onUpdate,
  selectedAnnotations,
  onUpdateMany,
  onDuplicate,
  onRemove,
  onMoveInStack,
  onTransformImage
}: {
  annotation: Annotation;
  selectedAnnotations: Annotation[];
  onUpdate: (id: string, updates: Partial<Annotation>, label?: string) => void;
  onUpdateMany: (updates: { id: string; updates: Partial<Annotation> }[], label?: string) => void;
  onDuplicate: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onMoveInStack: (
    id: string,
    direction: "forward" | "backward" | "front" | "back"
  ) => void;
  onTransformImage: (id: string, operation: "rotate-left" | "rotate-right" | "crop-square") => void;
}) {
  const multiple = selectedAnnotations.length > 1;
  const align = (axis: "left" | "right" | "top" | "bottom" | "center" | "middle") => {
    const items = selectedAnnotations.filter((item) => item.kind === "text" || item.kind === "image" || item.kind === "redaction");
    if (items.length < 2) return;
    const values = items.map((item) => {
      const width = item.kind === "image" || item.kind === "redaction" ? item.width : 0;
      const height = item.kind === "image" || item.kind === "redaction" ? item.height : 0;
      return { item, width, height };
    });
    const minX = Math.min(...values.map(({ item }) => item.x));
    const maxX = Math.max(...values.map(({ item, width }) => item.x + width));
    const minY = Math.min(...values.map(({ item }) => item.y));
    const maxY = Math.max(...values.map(({ item, height }) => item.y + height));
    onUpdateMany(values.map(({ item, width, height }) => ({
      id: item.id,
      updates: {
        ...(axis === "left" ? { x: minX } : axis === "right" ? { x: Math.max(0, maxX - width) } : axis === "center" ? { x: Math.max(0, (minX + maxX - width) / 2) } : {}),
        ...(axis === "top" ? { y: minY } : axis === "bottom" ? { y: Math.max(0, maxY - height) } : axis === "middle" ? { y: Math.max(0, (minY + maxY - height) / 2) } : {})
      }
    })), `Align ${items.length} annotations`);
  };
  const snapPrimary = () => {
    const round = (value: number) => Math.round(value * 100) / 100;
    if (annotation.kind === "image" || annotation.kind === "redaction") {
      onUpdate(annotation.id, { x: round(annotation.x), y: round(annotation.y), width: round(annotation.width), height: round(annotation.height) }, "Snap annotation to grid");
    } else if (annotation.kind === "text") {
      onUpdate(annotation.id, { x: round(annotation.x), y: round(annotation.y) }, "Snap annotation to grid");
    }
  };
  return (
    <aside
      role="region"
      aria-label={`Edit selected ${annotation.kind} annotation`}
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-panel px-4 py-4"
    >
      <div className="mb-4 border-b border-white/10 pb-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-300">
          Properties
        </span>
        <h2 className="mt-1 text-sm font-semibold capitalize text-zinc-100">
          {annotation.kind} annotation
        </h2>
        <p className="mt-1 text-[11px] leading-4 text-zinc-500">
          {multiple ? `${selectedAnnotations.length} annotations selected.` : "Changes apply to the currently selected annotation."}
        </p>
      </div>

      {annotation.kind === "text" && (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium text-zinc-400">
              Content
            </span>
            <input
              key={`${annotation.id}-${annotation.text}`}
              aria-label="Selected text content"
              defaultValue={annotation.text}
              className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2.5 text-xs text-zinc-100 outline-none transition focus:border-orange-500"
              onBlur={(event) => {
                const text = event.currentTarget.value.trim();
                if (text && text !== annotation.text) {
                  onUpdate(annotation.id, { text }, "Edit text");
                }
              }}
            />
          </label>
          <div className="grid grid-cols-[1fr_4.5rem] gap-2">
            <label>
              <span className="mb-1.5 block text-[11px] font-medium text-zinc-400">
                Font
              </span>
              <select
                aria-label="Selected text font"
                value={annotation.fontFamily}
                onChange={(event) => onUpdate(annotation.id, {
                  fontFamily: event.target.value as TextStyle["fontFamily"]
                }, "Change text font")}
                className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-xs text-zinc-200"
              >
                <option value="helvetica">Arial</option>
                <option value="times">Times</option>
                <option value="courier">Courier</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[11px] font-medium text-zinc-400">
                Size
              </span>
              <input
                aria-label="Selected text size"
                type="number"
                min="6"
                max="96"
                value={annotation.size}
                onChange={(event) => onUpdate(annotation.id, {
                  size: Math.min(96, Math.max(6, Number(event.target.value) || 6))
                }, "Change text size")}
                className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-xs text-zinc-200"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Toggle bold"
              aria-pressed={annotation.bold}
              className={`h-8 w-8 rounded text-xs font-bold transition ${
                annotation.bold
                  ? "bg-orange-500/25 text-orange-200"
                  : "text-zinc-300 hover:bg-white/10"
              }`}
              onClick={() => onUpdate(annotation.id, { bold: !annotation.bold }, "Toggle bold")}
            >
              B
            </button>
            <button
              type="button"
              aria-label="Toggle italic"
              aria-pressed={annotation.italic}
              className={`h-8 w-8 rounded text-xs italic transition ${
                annotation.italic
                  ? "bg-orange-500/25 text-orange-200"
                  : "text-zinc-300 hover:bg-white/10"
              }`}
              onClick={() => onUpdate(annotation.id, { italic: !annotation.italic }, "Toggle italic")}
            >
              I
            </button>
            <label className="ml-auto flex items-center gap-2 text-[11px] text-zinc-400">
              Color
              <input
                aria-label="Selected annotation color"
                type="color"
                value={annotation.color}
                onChange={(event) => onUpdate(annotation.id, {
                  color: event.target.value
                }, "Recolor text")}
                className="h-8 w-9 cursor-pointer rounded border-0 bg-transparent"
              />
            </label>
          </div>
        </div>
      )}

      {(annotation.kind === "pen" || annotation.kind === "highlight") && (
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-[11px] text-zinc-400">
            Color
            <input
              aria-label="Selected annotation color"
              type="color"
              value={annotation.color}
              onChange={(event) => onUpdate(annotation.id, {
                color: event.target.value
              }, `Recolor ${annotation.kind}`)}
              className="h-8 w-9 cursor-pointer rounded border-0 bg-transparent"
            />
          </label>
          <label className="block">
            <span className="mb-2 flex justify-between text-[11px] text-zinc-400">
              Stroke width
              <span>{annotation.width}px</span>
            </span>
            <input
              aria-label="Selected stroke width"
              type="range"
              min="1"
              max={annotation.kind === "highlight" ? "60" : "20"}
              value={annotation.width}
              onChange={(event) => onUpdate(annotation.id, {
                width: Number(event.target.value)
              }, "Change stroke width")}
              className="w-full accent-orange-500"
            />
          </label>
          {annotation.kind === "highlight" && (
            <label className="block">
              <span className="mb-2 flex justify-between text-[11px] text-zinc-400">
                Opacity
                <span>{Math.round(annotation.opacity * 100)}%</span>
              </span>
              <input
                aria-label="Selected highlight opacity"
                type="range"
                min="10"
                max="80"
                value={Math.round(annotation.opacity * 100)}
                onChange={(event) => onUpdate(annotation.id, {
                  opacity: Number(event.target.value) / 100
                }, "Change highlight opacity")}
                className="w-full accent-yellow-400"
              />
            </label>
          )}
        </div>
      )}

      {annotation.kind === "redaction" && (
        <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-[11px] leading-5 text-red-100/80">
          Secure redactions are permanently applied by rasterizing affected pages during export.
        </div>
      )}

      {annotation.kind === "image" && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3 text-[11px] leading-5 text-zinc-400">
          <p>Drag the image to move it. Use its lower-right handle to resize it while preserving its aspect ratio.</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" className="flex h-8 items-center justify-center gap-1 rounded border border-white/10 text-[10px] text-zinc-200 hover:bg-white/10" onClick={() => onTransformImage(annotation.id, "rotate-left")}><RotateCcw size={13} /> Left</button>
            <button type="button" className="flex h-8 items-center justify-center gap-1 rounded border border-white/10 text-[10px] text-zinc-200 hover:bg-white/10" onClick={() => onTransformImage(annotation.id, "rotate-right")}><RotateCw size={13} /> Right</button>
            <button type="button" className="flex h-8 items-center justify-center gap-1 rounded border border-white/10 text-[10px] text-zinc-200 hover:bg-white/10" onClick={() => onTransformImage(annotation.id, "crop-square")}><Crop size={13} /> Square</button>
          </div>
          <p className="text-[10px] leading-4 text-zinc-500">Rotate turns the image by 90°. Square crop trims equally from the longer sides and applies permanently to the annotation.</p>
        </div>
      )}

      {(annotation.kind === "text" || annotation.kind === "image" || annotation.kind === "redaction") && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <span className="mb-2 block text-[11px] font-medium text-zinc-400">Position and size</span>
          <div className="grid grid-cols-2 gap-2">
            <label><span className="mb-1 block text-[10px] text-zinc-500">X</span><input aria-label="Annotation X position" type="number" min="0" max="100" step="0.1" value={Math.round(annotation.x * 1000) / 10} onChange={(event) => onUpdate(annotation.id, { x: Math.max(0, Math.min(1, Number(event.target.value) / 100)) }, "Move annotation")} className="h-8 w-full rounded border border-white/15 bg-black/20 px-2 text-xs" /></label>
            <label><span className="mb-1 block text-[10px] text-zinc-500">Y</span><input aria-label="Annotation Y position" type="number" min="0" max="100" step="0.1" value={Math.round(annotation.y * 1000) / 10} onChange={(event) => onUpdate(annotation.id, { y: Math.max(0, Math.min(1, Number(event.target.value) / 100)) }, "Move annotation")} className="h-8 w-full rounded border border-white/15 bg-black/20 px-2 text-xs" /></label>
            {(annotation.kind === "image" || annotation.kind === "redaction") && <><label><span className="mb-1 block text-[10px] text-zinc-500">Width</span><input aria-label="Annotation width" type="number" min="1" max="100" step="0.1" value={Math.round(annotation.width * 1000) / 10} onChange={(event) => onUpdate(annotation.id, { width: Math.max(0.01, Math.min(1 - annotation.x, Number(event.target.value) / 100)) }, "Resize annotation")} className="h-8 w-full rounded border border-white/15 bg-black/20 px-2 text-xs" /></label><label><span className="mb-1 block text-[10px] text-zinc-500">Height</span><input aria-label="Annotation height" type="number" min="1" max="100" step="0.1" value={Math.round(annotation.height * 1000) / 10} onChange={(event) => onUpdate(annotation.id, { height: Math.max(0.01, Math.min(1 - annotation.y, Number(event.target.value) / 100)) }, "Resize annotation")} className="h-8 w-full rounded border border-white/15 bg-black/20 px-2 text-xs" /></label></>}
          </div>
          <button type="button" className="mt-2 h-8 w-full rounded border border-white/10 text-xs text-zinc-300 hover:bg-white/10" onClick={snapPrimary}>Snap to 1% grid</button>
        </div>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        <button type="button" className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-white/10 text-xs font-medium text-zinc-300 hover:bg-white/10" onClick={() => onDuplicate(selectedAnnotations.map((item) => item.id))}><Copy size={14} />Duplicate{multiple ? ` ${selectedAnnotations.length}` : ""}</button>
        {multiple && <div className="mt-3"><span className="mb-2 block text-[11px] font-medium text-zinc-400">Alignment guides</span><div className="grid grid-cols-3 gap-1.5">{(["left", "center", "right", "top", "middle", "bottom"] as const).map((direction) => <button key={direction} type="button" className="h-8 rounded border border-white/10 text-[10px] capitalize text-zinc-300 hover:bg-white/10" onClick={() => align(direction)}>{direction}</button>)}</div><p className="mt-2 text-[10px] leading-4 text-zinc-500">Aligns the selected text, image, and redaction annotations. Hold Ctrl/Command while clicking annotations to select more.</p></div>}
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <span className="mb-2 block text-[11px] font-medium text-zinc-400">Layer order</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-label="Bring selected annotation forward"
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => onMoveInStack(annotation.id, "forward")}
          >
            <ChevronUp size={14} /> Forward
          </button>
          <button
            type="button"
            aria-label="Send selected annotation backward"
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => onMoveInStack(annotation.id, "backward")}
          >
            <ChevronDown size={14} /> Backward
          </button>
          <button
            type="button"
            aria-label="Bring selected annotation to front"
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => onMoveInStack(annotation.id, "front")}
          >
            <ArrowUpToLine size={14} /> To front
          </button>
          <button
            type="button"
            aria-label="Send selected annotation to back"
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 text-xs font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => onMoveInStack(annotation.id, "back")}
          >
            <ArrowDownToLine size={14} /> To back
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-zinc-500">Controls which overlapping annotation appears on top.</p>
      </div>

      <button
        type="button"
        aria-label={`Delete selected ${annotation.kind}`}
        className="mt-auto flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-md border border-red-400/20 bg-red-500/10 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
        onClick={() => onRemove(annotation.id)}
      >
        <Trash2 size={15} />
        Delete annotation
      </button>
    </aside>
  );
}
