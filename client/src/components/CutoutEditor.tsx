import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Lasso, Undo2, RotateCcw, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Pt = { x: number; y: number };
type Mode = "erase" | "lasso";

interface CutoutEditorProps {
  /** Transparent-PNG cutout produced by background removal. */
  cutoutBlob: Blob;
  /**
   * Continue to the background picker. `edited` is a fresh PNG blob when the
   * user made changes, or `null` when they left the cutout untouched (so the
   * caller can keep the original blob and avoid a needless re-encode).
   */
  onDone: (edited: Blob | null) => void;
}

// Edit at a capped resolution: matches the composite frame height (1600px tall)
// so cleanup never undercuts output quality, while keeping undo snapshots (full
// ImageData) affordable on phones.
const MAX_EDIT_SIDE = 1600;
// Undo depth. Each committed stroke stores one ImageData (~4 bytes/px).
const HISTORY_LIMIT = 8;

/**
 * Manual cleanup of a background-removed cutout. Two touch-friendly tools:
 *  - Erase: drag to rub out stray pixels the AI missed (adjustable brush).
 *  - Lasso: draw a freeform loop to cut away a whole leftover chunk.
 * Plus undo + reset. Erased areas show a checkerboard so it's obvious what
 * will become transparent in the final composite.
 */
export default function CutoutEditor({ cutoutBlob, onDone }: CutoutEditorProps) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  // Off-screen "committed" cutout — the source of truth we edit and export.
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const originalRef = useRef<ImageData | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const lassoPointsRef = useRef<Pt[]>([]);
  const lastPointRef = useRef<Pt | null>(null);
  const drawingRef = useRef(false);
  const modeRef = useRef<Mode>("erase");
  const brushRef = useRef(40);

  const [mode, setMode] = useState<Mode>("erase");
  const [brush, setBrush] = useState(40);
  const [maxBrush, setMaxBrush] = useState(200);
  const [canUndo, setCanUndo] = useState(false);
  const [edited, setEdited] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Repaint the visible canvas from the committed base, plus any live overlay
  // (the in-progress lasso loop, or the brush ring while erasing).
  const redrawView = useCallback(() => {
    const view = viewRef.current;
    const base = baseRef.current;
    if (!view || !base) return;
    const ctx = view.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(base, 0, 0);

    if (modeRef.current === "lasso" && lassoPointsRef.current.length > 1) {
      const pts = lassoPointsRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = "rgba(239,68,68,0.25)";
      ctx.fill();
      ctx.lineWidth = Math.max(2, view.width * 0.004);
      ctx.strokeStyle = "rgba(239,68,68,0.95)";
      ctx.setLineDash([view.width * 0.02, view.width * 0.02]);
      ctx.stroke();
      ctx.restore();
    }

    if (modeRef.current === "erase" && drawingRef.current && lastPointRef.current) {
      const p = lastPointRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, brushRef.current / 2, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, view.width * 0.003);
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
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
      lassoPointsRef.current = [];
      lastPointRef.current = null;
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

  useEffect(() => { modeRef.current = mode; lassoPointsRef.current = []; redrawView(); }, [mode, redrawView]);
  useEffect(() => { brushRef.current = brush; }, [brush]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const view = viewRef.current!;
    const rect = view.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * view.width,
      y: ((e.clientY - rect.top) / rect.height) * view.height,
    };
  };

  const snapshot = () => {
    const base = baseRef.current;
    if (!base) return;
    const ctx = base.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, base.width, base.height));
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
    setCanUndo(true);
  };

  const eraseSegment = (from: Pt, to: Pt) => {
    const base = baseRef.current;
    if (!base) return;
    const ctx = base.getContext("2d");
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
    // Explicit dot so a single tap also erases.
    ctx.beginPath();
    ctx.arc(to.x, to.y, brushRef.current / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    drawingRef.current = true;
    const p = getPoint(e);
    if (modeRef.current === "erase") {
      snapshot();
      lastPointRef.current = p;
      eraseSegment(p, p);
      setEdited(true);
    } else {
      lassoPointsRef.current = [p];
    }
    redrawView();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = getPoint(e);
    if (modeRef.current === "erase") {
      eraseSegment(lastPointRef.current ?? p, p);
      lastPointRef.current = p;
    } else {
      lassoPointsRef.current.push(p);
    }
    redrawView();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (modeRef.current === "lasso") {
      const pts = lassoPointsRef.current;
      if (pts.length >= 3) {
        snapshot();
        const base = baseRef.current;
        const ctx = base?.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          setEdited(true);
        }
      }
      lassoPointsRef.current = [];
    }
    lastPointRef.current = null;
    redrawView();
  };

  const undo = () => {
    const hist = historyRef.current;
    if (!hist.length) return;
    const snap = hist.pop()!;
    const base = baseRef.current;
    base?.getContext("2d")?.putImageData(snap, 0, 0);
    setCanUndo(hist.length > 0);
    setEdited(hist.length > 0);
    lassoPointsRef.current = [];
    redrawView();
  };

  const reset = () => {
    const orig = originalRef.current;
    const base = baseRef.current;
    if (!orig || !base) return;
    base.getContext("2d")?.putImageData(orig, 0, 0);
    historyRef.current = [];
    lassoPointsRef.current = [];
    setCanUndo(false);
    setEdited(false);
    redrawView();
  };

  const finish = () => {
    if (!edited) { onDone(null); return; }
    const base = baseRef.current;
    if (!base) { onDone(null); return; }
    setFinishing(true);
    base.toBlob(
      (blob) => { setFinishing(false); onDone(blob ?? null); },
      "image/png"
    );
  };

  return (
    <div className="space-y-3" data-testid="cutout-editor">
      <div>
        <p className="text-sm font-medium text-foreground">Clean up the cut-out</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Optional — rub out or lasso off any leftover background. Checkerboard = removed.
        </p>
      </div>

      <div className="rounded-xl overflow-hidden bg-muted flex items-center justify-center">
        <canvas
          ref={viewRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="max-w-full max-h-[48vh] w-auto h-auto block touch-none cursor-crosshair"
          style={{
            backgroundImage:
              "linear-gradient(45deg,#e2e2e2 25%,transparent 25%),linear-gradient(-45deg,#e2e2e2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e2e2 75%),linear-gradient(-45deg,transparent 75%,#e2e2e2 75%)",
            backgroundSize: "18px 18px",
            backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
            backgroundColor: "#f6f6f6",
          }}
          data-testid="canvas-cutout-editor"
        />
      </div>

      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          variant="outline"
          className="justify-start"
        >
          <ToggleGroupItem value="erase" className="gap-1.5 px-3" data-testid="toggle-erase">
            <Eraser className="h-4 w-4" /> Erase
          </ToggleGroupItem>
          <ToggleGroupItem value="lasso" className="gap-1.5 px-3" data-testid="toggle-lasso">
            <Lasso className="h-4 w-4" /> Lasso
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
            data-testid="button-undo"
          >
            <Undo2 className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={reset}
            disabled={!edited}
            title="Reset"
            data-testid="button-reset-edits"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {mode === "erase" && (
        <div className="flex items-center gap-3" data-testid="brush-size-control">
          <span className="text-xs text-muted-foreground shrink-0">Brush</span>
          <Slider
            min={8}
            max={maxBrush}
            step={2}
            value={[brush]}
            onValueChange={(v) => setBrush(v[0])}
            className="flex-1"
            data-testid="slider-brush"
          />
        </div>
      )}

      <Button
        className="w-full gap-2"
        size="lg"
        onClick={finish}
        disabled={!loaded || finishing}
        data-testid="button-cleanup-done"
      >
        {finishing
          ? <><Loader2 className="h-5 w-5 animate-spin" /> Applying…</>
          : <>Next: Background <ArrowRight className="h-5 w-5" /></>}
      </Button>
    </div>
  );
}
