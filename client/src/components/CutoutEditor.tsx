import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Wand2, Undo2, RotateCcw, ArrowRight, ArrowLeft, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Pt = { x: number; y: number };
type Mode = "erase" | "wand";

interface CutoutEditorProps {
  /** Transparent-PNG cutout produced by background removal. */
  cutoutBlob: Blob;
  /**
   * Continue to the background picker. `edited` is a fresh PNG blob when the
   * user made changes, or `null` when they left the cutout untouched (so the
   * caller can keep the original blob and avoid a needless re-encode).
   */
  onDone: (edited: Blob | null) => void;
  /** Back out of the editor (the full-screen overlay hides the page header). */
  onBack?: () => void;
}

// Edit at a capped resolution: matches the composite frame height (1600px tall)
// so cleanup never undercuts output quality, while keeping undo snapshots (full
// ImageData) affordable on phones.
const MAX_EDIT_SIDE = 1600;
// Undo depth. Each snapshot is a full ImageData (~7.7MB at 1600px on portrait);
// capped low to bound peak memory on mobile Safari.
const HISTORY_LIMIT = 5;
const MIN_SCALE = 1;
const MAX_SCALE = 6;
// The erase target sits this many CSS px ABOVE the finger so it isn't hidden.
const ERASE_OFFSET_CSS = 54;

/**
 * Manual cleanup of a background-removed cutout. Touch tools:
 *  - Erase: drag to rub out stray pixels (adjustable brush). The target ring is
 *    offset above the finger so you can see what you're doing.
 *  - Magic-wand: tap a leftover background patch to remove the connected region
 *    of similar colour (adjustable tolerance) — for bits the model missed.
 * Pinch (or the +/- buttons) to zoom and pan for precision. Undo + reset.
 * Erased areas show a checkerboard so it's obvious what becomes transparent.
 */
export default function CutoutEditor({ cutoutBlob, onDone, onBack }: CutoutEditorProps) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  // Off-screen "committed" cutout — the source of truth we edit and export.
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const originalRef = useRef<ImageData | null>(null);
  const historyRef = useRef<ImageData[]>([]);

  const lastBaseRef = useRef<Pt | null>(null);      // last erase point (base px)
  const drawingRef = useRef(false);                 // erase stroke in progress
  const modeRef = useRef<Mode>("erase");
  const brushRef = useRef(40);
  const toleranceRef = useRef(32);

  // View transform: content is drawn at base*scale + pan (in view-canvas px).
  const scaleRef = useRef(1);
  const panRef = useRef<Pt>({ x: 0, y: 0 });
  // Active pointers (id -> view px) for pinch-zoom/pan.
  const pointersRef = useRef<Map<number, Pt>>(new Map());
  const pinchRef = useRef<{ dist: number; mid: Pt } | null>(null);
  const suppressToolRef = useRef(false);            // ignore tool until all fingers lift
  const tapRef = useRef<{ start: Pt; moved: boolean } | null>(null); // wand tap tracking
  const ringRef = useRef<Pt | null>(null);          // erase ring position (view px)

  const [mode, setMode] = useState<Mode>("erase");
  const [brush, setBrush] = useState(40);
  const [maxBrush, setMaxBrush] = useState(200);
  const [tolerance, setTolerance] = useState(32);
  const [canUndo, setCanUndo] = useState(false);
  const [edited, setEdited] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [zoom, setZoom] = useState(1);

  const clampPan = (scale: number, pan: Pt): Pt => {
    const base = baseRef.current;
    if (!base) return pan;
    const sw = base.width * scale, sh = base.height * scale;
    const x = sw <= base.width ? (base.width - sw) / 2 : Math.min(0, Math.max(base.width - sw, pan.x));
    const y = sh <= base.height ? (base.height - sh) / 2 : Math.min(0, Math.max(base.height - sh, pan.y));
    return { x, y };
  };

  const redrawView = useCallback(() => {
    const view = viewRef.current, base = baseRef.current;
    if (!view || !base) return;
    const ctx = view.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    const s = scaleRef.current, p = panRef.current;
    ctx.setTransform(s, 0, 0, s, p.x, p.y);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Erase target ring (in view px).
    if (modeRef.current === "erase" && ringRef.current) {
      const r = (brushRef.current / 2) * s;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ringRef.current.x, ringRef.current.y, r, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, view.width * 0.004);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ringRef.current.x, ringRef.current.y, r, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, view.width * 0.002);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  // Load the cutout into the base canvas whenever the source blob changes.
  useEffect(() => {
    let revoked = false;
    const url = URL.createObjectURL(cutoutBlob);
    const revoke = () => { if (!revoked) { URL.revokeObjectURL(url); revoked = true; } };
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = longest > MAX_EDIT_SIDE ? MAX_EDIT_SIDE / longest : 1;
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const base = document.createElement("canvas");
      base.width = w;
      base.height = h;
      const bctx = base.getContext("2d", { willReadFrequently: true });
      if (!bctx) { revoke(); return; }
      bctx.clearRect(0, 0, w, h);
      bctx.drawImage(img, 0, 0, w, h);
      baseRef.current = base;
      originalRef.current = bctx.getImageData(0, 0, w, h);
      const view = viewRef.current;
      if (view) { view.width = w; view.height = h; }
      historyRef.current = [];
      lastBaseRef.current = null;
      ringRef.current = null;
      scaleRef.current = 1;
      panRef.current = { x: 0, y: 0 };
      setZoom(1);
      setCanUndo(false);
      setEdited(false);
      const defaultBrush = Math.round(Math.max(24, w * 0.05));
      brushRef.current = defaultBrush;
      setBrush(defaultBrush);
      setMaxBrush(Math.max(60, Math.round(w * 0.3)));
      setLoaded(true);
      redrawView();
      revoke();
    };
    img.onerror = revoke;
    img.src = url;
    return revoke;
  }, [cutoutBlob, redrawView]);

  useEffect(() => { modeRef.current = mode; ringRef.current = null; redrawView(); }, [mode, redrawView]);
  useEffect(() => { brushRef.current = brush; }, [brush]);
  useEffect(() => { toleranceRef.current = tolerance; }, [tolerance]);

  const cssToView = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const view = viewRef.current!;
    const rect = view.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * view.width,
      y: ((e.clientY - rect.top) / rect.height) * view.height,
    };
  };
  const viewToBase = (v: Pt): Pt => ({
    x: (v.x - panRef.current.x) / scaleRef.current,
    y: (v.y - panRef.current.y) / scaleRef.current,
  });
  // View-px length of the erase offset (CSS px → view px via canvas/rect ratio).
  const offsetView = (): number => {
    const view = viewRef.current!;
    const rect = view.getBoundingClientRect();
    return ERASE_OFFSET_CSS * (view.height / rect.height);
  };

  const snapshot = () => {
    const base = baseRef.current;
    const ctx = base?.getContext("2d", { willReadFrequently: true });
    if (!base || !ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, base.width, base.height));
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
    setCanUndo(true);
  };

  const eraseSegment = (from: Pt, to: Pt) => {
    const ctx = baseRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = brushRef.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, brushRef.current / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Flood-fill: from a seed pixel, clear the connected region of similar colour.
  const magicErase = (seed: Pt): boolean => {
    const base = baseRef.current;
    const ctx = base?.getContext("2d", { willReadFrequently: true });
    if (!base || !ctx) return false;
    const W = base.width, H = base.height;
    const sx = Math.round(seed.x), sy = Math.round(seed.y);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return false;
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    const si = (sy * W + sx) * 4;
    if (d[si + 3] === 0) return false; // seed already transparent — nothing to grab
    const sr = d[si], sg = d[si + 1], sb = d[si + 2];
    const tol = toleranceRef.current;
    const tol2 = tol * tol * 3; // squared sum across RGB
    const seen = new Uint8Array(W * H);
    const stack: number[] = [sy * W + sx];
    seen[sy * W + sx] = 1;
    let changed = 0;
    while (stack.length) {
      const pIdx = stack.pop()!;
      const i = pIdx * 4;
      if (d[i + 3] === 0) continue; // transparent boundary
      const dr = d[i] - sr, dg = d[i + 1] - sg, db = d[i + 2] - sb;
      if (dr * dr + dg * dg + db * db > tol2) continue; // colour boundary
      d[i + 3] = 0; changed++;
      const x = pIdx % W, y = (pIdx / W) | 0;
      if (x > 0 && !seen[pIdx - 1]) { seen[pIdx - 1] = 1; stack.push(pIdx - 1); }
      if (x < W - 1 && !seen[pIdx + 1]) { seen[pIdx + 1] = 1; stack.push(pIdx + 1); }
      if (y > 0 && !seen[pIdx - W]) { seen[pIdx - W] = 1; stack.push(pIdx - W); }
      if (y < H - 1 && !seen[pIdx + W]) { seen[pIdx + W] = 1; stack.push(pIdx + W); }
    }
    if (changed) ctx.putImageData(imgData, 0, 0);
    return changed > 0;
  };

  // ---- Zoom ----
  const applyZoom = (nextScale: number, focusView: Pt) => {
    const base = baseRef.current;
    if (!base) return;
    const s0 = scaleRef.current;
    const s1 = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
    const p0 = panRef.current;
    // Keep the focus point stationary: p1 = focus - (focus - p0) * (s1/s0)
    const p1 = {
      x: focusView.x - (focusView.x - p0.x) * (s1 / s0),
      y: focusView.y - (focusView.y - p0.y) * (s1 / s0),
    };
    scaleRef.current = s1;
    panRef.current = clampPan(s1, p1);
    setZoom(Math.round(s1 * 10) / 10);
    redrawView();
  };
  const zoomButton = (dir: 1 | -1) => {
    const base = baseRef.current;
    if (!base) return;
    applyZoom(scaleRef.current * (dir > 0 ? 1.5 : 1 / 1.5), { x: base.width / 2, y: base.height / 2 });
  };

  // ---- Pointer handling ----
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const v = cssToView(e);
    pointersRef.current.set(e.pointerId, v);

    if (pointersRef.current.size >= 2) {
      // Entering pinch — abort any in-progress erase stroke (revert its snapshot).
      if (drawingRef.current && modeRef.current === "erase") {
        const snap = historyRef.current.pop();
        if (snap) baseRef.current?.getContext("2d")?.putImageData(snap, 0, 0);
        setCanUndo(historyRef.current.length > 0);
        // If that reverted the first-and-only stroke, we're back to pristine —
        // keep `edited` honest so finish() returns null instead of re-encoding.
        setEdited(historyRef.current.length > 0);
      }
      drawingRef.current = false;
      tapRef.current = null;
      ringRef.current = null;
      suppressToolRef.current = true;
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      pinchRef.current = {
        dist: Math.hypot(dx, dy),
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
      redrawView();
      return;
    }

    if (suppressToolRef.current) return; // still lifting fingers from a pinch
    // Single-finger tool start.
    if (modeRef.current === "erase") {
      drawingRef.current = true;
      const target = viewToBase({ x: v.x, y: v.y - offsetView() });
      ringRef.current = { x: v.x, y: v.y - offsetView() };
      snapshot();
      eraseSegment(target, target);
      lastBaseRef.current = target;
      setEdited(true);
      redrawView();
    } else {
      // Wand: record tap; act on pointerup if it stayed a tap.
      tapRef.current = { start: v, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    const v = cssToView(e);
    pointersRef.current.set(e.pointerId, v);

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const prev = pinchRef.current;
      if (prev.dist > 0) {
        applyZoom(scaleRef.current * (dist / prev.dist), mid);
        // Pan by midpoint movement.
        panRef.current = clampPan(scaleRef.current, {
          x: panRef.current.x + (mid.x - prev.mid.x),
          y: panRef.current.y + (mid.y - prev.mid.y),
        });
        redrawView();
      }
      pinchRef.current = { dist, mid };
      return;
    }

    if (suppressToolRef.current) return;
    if (modeRef.current === "erase" && drawingRef.current) {
      const target = viewToBase({ x: v.x, y: v.y - offsetView() });
      ringRef.current = { x: v.x, y: v.y - offsetView() };
      eraseSegment(lastBaseRef.current ?? target, target);
      lastBaseRef.current = target;
      redrawView();
    } else if (modeRef.current === "wand" && tapRef.current) {
      const d = Math.hypot(v.x - tapRef.current.start.x, v.y - tapRef.current.start.y);
      if (d > 8) tapRef.current.moved = true;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    const had = pointersRef.current.has(e.pointerId);
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) suppressToolRef.current = false;
    if (!had) return;

    if (modeRef.current === "wand" && tapRef.current && !tapRef.current.moved && !suppressToolRef.current) {
      const base = viewToBase(tapRef.current.start);
      snapshot();
      if (magicErase(base)) setEdited(true);
      else { historyRef.current.pop(); setCanUndo(historyRef.current.length > 0); } // nothing removed
      redrawView();
    }
    tapRef.current = null;

    if (drawingRef.current) {
      drawingRef.current = false;
      lastBaseRef.current = null;
      ringRef.current = null;
      redrawView();
    }
  };

  const undo = () => {
    const hist = historyRef.current;
    if (!hist.length) return;
    const snap = hist.pop()!;
    baseRef.current?.getContext("2d")?.putImageData(snap, 0, 0);
    setCanUndo(hist.length > 0);
    setEdited(hist.length > 0);
    redrawView();
  };

  const reset = () => {
    const orig = originalRef.current;
    const base = baseRef.current;
    if (!orig || !base) return;
    base.getContext("2d")?.putImageData(orig, 0, 0);
    historyRef.current = [];
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    ringRef.current = null;
    setZoom(1);
    setCanUndo(false);
    setEdited(false);
    redrawView();
  };

  const finish = () => {
    if (!edited) { onDone(null); return; }
    const base = baseRef.current;
    if (!base) { onDone(null); return; }
    setFinishing(true);
    base.toBlob((blob) => { setFinishing(false); onDone(blob ?? null); }, "image/png");
  };

  return (
    <div className="cutout-overlay fixed inset-0 z-50 bg-background flex flex-col" data-testid="cutout-editor">
      {/* Header — the overlay covers the page header, so carry a back button.
          `.has-env-banner .cutout-overlay` (index.css) drops the top below the
          env banner on non-prod; safe-area padding clears the notch on prod. */}
      <div className="flex items-center gap-3 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 border-b shrink-0">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} disabled={finishing} data-testid="button-cleanup-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">Clean up the cut-out</p>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">
            Tap to remove missed background, or erase. Pinch to zoom.
          </p>
        </div>
      </div>

      {/* Canvas fills the remaining screen. */}
      <div className="relative flex-1 min-h-0 bg-muted flex items-center justify-center overflow-hidden">
        <canvas
          ref={viewRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="max-w-full max-h-full w-auto h-auto block touch-none cursor-crosshair"
          style={{
            backgroundImage:
              "linear-gradient(45deg,#e2e2e2 25%,transparent 25%),linear-gradient(-45deg,#e2e2e2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e2e2 75%),linear-gradient(-45deg,transparent 75%,#e2e2e2 75%)",
            backgroundSize: "18px 18px",
            backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
            backgroundColor: "#f6f6f6",
          }}
          data-testid="canvas-cutout-editor"
        />
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <Button variant="secondary" size="icon" className="h-9 w-9 shadow" onClick={() => zoomButton(1)} data-testid="button-zoom-in" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" className="h-9 w-9 shadow" onClick={() => zoomButton(-1)} disabled={zoom <= MIN_SCALE} data-testid="button-zoom-out" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>
        {zoom > 1 && (
          <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white" data-testid="zoom-level">
            {zoom.toFixed(1)}×
          </span>
        )}
      </div>

      {/* Controls pinned to the bottom. */}
      <div className="shrink-0 border-t px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] space-y-2 bg-background">
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
            variant="outline"
            className="justify-start"
          >
            <ToggleGroupItem value="wand" className="gap-1.5 px-3" data-testid="toggle-wand">
              <Wand2 className="h-4 w-4" /> Magic
            </ToggleGroupItem>
            <ToggleGroupItem value="erase" className="gap-1.5 px-3" data-testid="toggle-erase">
              <Eraser className="h-4 w-4" /> Erase
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo} title="Undo" data-testid="button-undo">
              <Undo2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={reset} disabled={!edited} title="Reset" data-testid="button-reset-edits">
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {mode === "erase" ? (
          <div className="flex items-center gap-3" data-testid="brush-size-control">
            <span className="text-xs text-muted-foreground shrink-0 w-16">Brush</span>
            <Slider min={8} max={maxBrush} step={2} value={[brush]} onValueChange={(v) => setBrush(v[0])} className="flex-1" data-testid="slider-brush" />
          </div>
        ) : (
          <div className="flex items-center gap-3" data-testid="tolerance-control">
            <span className="text-xs text-muted-foreground shrink-0 w-16">Sensitivity</span>
            <Slider min={8} max={100} step={2} value={[tolerance]} onValueChange={(v) => setTolerance(v[0])} className="flex-1" data-testid="slider-tolerance" />
          </div>
        )}

        <Button className="w-full gap-2" size="lg" onClick={finish} disabled={!loaded || finishing} data-testid="button-cleanup-done">
          {finishing
            ? <><Loader2 className="h-5 w-5 animate-spin" /> Applying…</>
            : <>Next: Background <ArrowRight className="h-5 w-5" /></>}
        </Button>
      </div>
    </div>
  );
}
