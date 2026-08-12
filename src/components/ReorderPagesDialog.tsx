import { memo, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { ChevronsDown, ChevronsLeft, ChevronsRight, ChevronsUp, GripVertical, ListOrdered } from "lucide-react";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

type MoveDirection = "start" | "backward" | "forward" | "end";

const ReorderPagePreview = memo(function ReorderPagePreview({ page, size = 48 }: { page?: PDFPageProxy; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const dimensions = useMemo(() => {
    if (!page) return { width: size, height: Math.round(size * 1.32) };
    const viewport = page.getViewport({ scale: 1 });
    return { width: size, height: Math.max(size, Math.round(size * viewport.height / viewport.width)) };
  }, [page, size]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "150px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page || !visible) return;
    const source = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: dimensions.width / source.width });
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    setReady(false);
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const task = page.render({ canvasContext: context, viewport });
    void task.promise.then(() => setReady(true)).catch(() => undefined);
    return () => task.cancel();
  }, [dimensions.width, page, visible]);

  return (
    <div ref={hostRef} className="relative shrink-0 overflow-hidden rounded border border-white/10 bg-zinc-100 shadow-sm" style={dimensions}>
      {visible && page && <canvas ref={canvasRef} className="block h-full w-full" />}
      {!ready && <div className="absolute inset-0 animate-pulse bg-zinc-200" />}
    </div>
  );
});

function moveSelectedPages(order: number[], selected: Set<number>, direction: MoveDirection) {
  const selectedInOrder = order.filter((page) => selected.has(page));
  if (!selectedInOrder.length) return order;
  const remaining = order.filter((page) => !selected.has(page));
  const firstIndex = order.findIndex((page) => selected.has(page));
  const before = order.slice(0, firstIndex).filter((page) => !selected.has(page)).length;
  const insertionIndex = direction === "start" ? 0
    : direction === "end" ? remaining.length
      : direction === "backward" ? Math.max(0, before - 1)
        : Math.min(remaining.length, before + 1);
  return [
    ...remaining.slice(0, insertionIndex),
    ...selectedInOrder,
    ...remaining.slice(insertionIndex)
  ];
}

function movePagesBefore(order: number[], pagesToMove: number[], target: number) {
  const moving = new Set(pagesToMove);
  if (!moving.size || moving.has(target)) return order;
  const selectedInOrder = order.filter((page) => moving.has(page));
  const remaining = order.filter((page) => !moving.has(page));
  const index = remaining.indexOf(target);
  if (index === -1) return order;
  return [...remaining.slice(0, index), ...selectedInOrder, ...remaining.slice(index)];
}

export function ReorderPagesDialog({
  pageCount,
  pages,
  initialSelection,
  onApply,
  onClose
}: {
  pageCount: number;
  pages: PDFPageProxy[];
  initialSelection: number[];
  onApply: (order: number[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const initialOrder = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount]);
  const [order, setOrder] = useState(initialOrder);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialSelection));
  const [anchor, setAnchor] = useState(initialSelection[0] ?? 1);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setOrder(initialOrder);
    setSelected(new Set(initialSelection));
    setAnchor(initialSelection[0] ?? 1);
  }, [initialOrder, initialSelection]);

  const selectPage = (page: number, event: React.MouseEvent<HTMLButtonElement>) => {
    setSelected((current) => {
      if (event.shiftKey) {
        const start = order.indexOf(anchor);
        const end = order.indexOf(page);
        if (start === -1 || end === -1) return new Set([page]);
        return new Set(order.slice(Math.min(start, end), Math.max(start, end) + 1));
      }
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(current);
        if (next.has(page)) next.delete(page);
        else next.add(page);
        return next;
      }
      return new Set([page]);
    });
    setAnchor(page);
  };

  const move = (direction: MoveDirection) => {
    setOrder((current) => moveSelectedPages(current, selected, direction));
  };

  const dragStart = (page: number, event: ReactDragEvent<HTMLButtonElement>) => {
    const moving = selected.has(page) ? [...selected] : [page];
    if (!selected.has(page)) {
      setSelected(new Set([page]));
      setAnchor(page);
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-veritypdf-pages", JSON.stringify(moving));
  };

  const dropBefore = (target: number, event: ReactDragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    try {
      const moving = JSON.parse(event.dataTransfer.getData("application/x-veritypdf-pages")) as number[];
      if (!moving.length) return;
      setSelected(new Set(moving));
      setOrder((current) => movePagesBefore(current, moving, target));
    } catch {
      // Ignore non-page drags from outside this dialog.
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      await onApply(order);
      onClose();
    } finally {
      setApplying(false);
    }
  };

  const selectedCount = selected.size;
  const unchanged = order.every((page, index) => page === index + 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="presentation">
      <section aria-modal="true" aria-labelledby="reorder-pages-title" role="dialog" className="flex max-h-[min(48rem,calc(100vh-2rem))] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#202329] shadow-2xl">
        <header className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-400/10 text-orange-300"><ListOrdered size={20} /></div>
            <div>
              <h2 id="reorder-pages-title" className="text-base font-semibold text-white">Organize pages</h2>
              <p className="mt-1 text-sm text-zinc-400">Select cards and drag them into a new position, or use the move controls. Changes apply only when you confirm.</p>
            </div>
          </div>
          <button aria-label="Close reorder pages" className="rounded-md px-2 py-1 text-zinc-400 transition hover:bg-white/10 hover:text-white" onClick={onClose}>×</button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_12rem] gap-5 p-5 max-sm:grid-cols-1">
          <div className="min-h-0">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
              <span>{selectedCount ? `${selectedCount} page${selectedCount === 1 ? "" : "s"} selected` : "Select one or more pages"}</span>
              <span>Ctrl/Command-click to add · Shift-click for a range</span>
            </div>
            <div className="grid max-h-[30rem] grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 overflow-y-auto rounded-lg border border-white/10 bg-black/15 p-3">
              {order.map((page, index) => (
                <button
                  key={page}
                  draggable
                  className={`relative flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center text-sm transition active:scale-[0.985] ${selected.has(page) ? "border-orange-400/70 bg-orange-500/20 text-orange-100 ring-1 ring-orange-400/50" : "border-white/10 bg-white/[0.025] text-zinc-300 hover:border-zinc-500 hover:bg-white/10 active:bg-white/15"}`}
                  onClick={(event) => selectPage(page, event)}
                  onDragStart={(event) => dragStart(page, event)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropBefore(page, event)}
                >
                  <span className="absolute left-2 top-2 flex items-center gap-1 text-[10px] text-zinc-500"><GripVertical size={13} /> {index + 1}</span>
                  <ReorderPagePreview page={pages[page - 1]} size={92} />
                  <span className="font-medium">Page {page}</span>
                  {selected.has(page) && <span className="text-[10px] text-orange-200">Selected</span>}
                </button>
              ))}
            </div>
          </div>
          <aside className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/15 p-3">
            <span className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Move selected</span>
            <button className="flex h-10 items-center gap-2 rounded-md px-3 text-sm text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={!selectedCount} onClick={() => move("start")}><ChevronsUp size={17} /> To beginning</button>
            <button className="flex h-10 items-center gap-2 rounded-md px-3 text-sm text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={!selectedCount} onClick={() => move("backward")}><ChevronsLeft size={17} /> Earlier</button>
            <button className="flex h-10 items-center gap-2 rounded-md px-3 text-sm text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={!selectedCount} onClick={() => move("forward")}><ChevronsRight size={17} /> Later</button>
            <button className="flex h-10 items-center gap-2 rounded-md px-3 text-sm text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={!selectedCount} onClick={() => move("end")}><ChevronsDown size={17} /> To end</button>
          </aside>
        </div>
        <footer className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <span className="text-xs text-zinc-500">{unchanged ? "The order has not changed." : "The new order will be one undoable document change."}</span>
          <div className="flex gap-3">
            <button className="rounded-md px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white" disabled={applying} onClick={onClose}>Cancel</button>
            <button className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={applying || unchanged} onClick={() => void apply()}>{applying ? "Applying…" : "Apply order"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
