import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { LoaderCircle } from "lucide-react";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { originalPage } from "../lib/pageView";

export function PageThumbnail({
  page,
  selected,
  current = false,
  selectedPages,
  reorderEnabled,
  onClick,
  onToggle,
  onMove
}: {
  page: PDFPageProxy;
  selected: boolean;
  current?: boolean;
  reorderEnabled: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggle?: () => void;
  onMove: (from: number[], to: number) => void;
  selectedPages?: number[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [renderActive, setRenderActive] = useState(false);
  const [rendered, setRendered] = useState(false);
  const source = originalPage(page);
  const viewport = useMemo(() => {
    const raw = source.getViewport({ scale: 1 });
    return source.getViewport({ scale: 112 / raw.width });
  }, [source]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(
      ([entry]) => setRenderActive(entry.isIntersecting),
      { rootMargin: "500px 0px" }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !renderActive) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    setRendered(false);
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const task = source.render({ canvasContext: context, viewport });
    void task.promise
      .then(() => setRendered(true))
      .catch(() => {
        // Rendering cancellation is expected as thumbnails leave the viewport.
      });
    return () => task.cancel();
  }, [source, renderActive, viewport]);

  return (
    <div className="relative">
      {onToggle && <label className="absolute left-1 top-1 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded bg-[#202329]">
        <input type="checkbox" aria-label={`Select page ${page.pageNumber}`} checked={selected} disabled={!reorderEnabled} onChange={onToggle} className="h-4 w-4 accent-orange-500" />
      </label>}
    <button
      onClick={onClick}
      aria-pressed={selected}
      aria-current={current ? "page" : undefined}
      draggable={reorderEnabled}
      onDragStart={(event) => {
        const pages = selectedPages?.includes(page.pageNumber)
          ? selectedPages
          : [page.pageNumber];
        event.dataTransfer.setData("text/pages", JSON.stringify(pages));
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!reorderEnabled) return;
        try {
          const from = JSON.parse(event.dataTransfer.getData("text/pages")) as number[];
          if (from.length) onMove(from, page.pageNumber);
        } catch {
          // Ignore malformed drag data from outside the thumbnail panel.
        }
      }}
      className={`group w-full rounded-lg border p-2 transition ${
        selected
          ? "border-accent bg-accent/10"
          : "border-transparent hover:border-zinc-600 hover:bg-white/5"
      }`}
    >
      <div
        ref={hostRef}
        className="relative mx-auto"
        style={{
          width: `${Math.ceil(viewport.width)}px`,
          height: `${Math.ceil(viewport.height)}px`
        }}
      >
        {renderActive && <canvas
          ref={ref}
          className="block bg-white shadow-md"
          style={{
            width: `${Math.ceil(viewport.width)}px`,
            height: `${Math.ceil(viewport.height)}px`
          }}
        />}
        {(!renderActive || !rendered) && (
          <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-zinc-200 text-zinc-400">
            <LoaderCircle size={14} className={renderActive ? "animate-spin" : ""} />
          </div>
        )}
      </div>
      <span className="mt-2 block text-center text-xs text-zinc-400">
        {page.pageNumber}
      </span>
    </button>
    </div>
  );
}
