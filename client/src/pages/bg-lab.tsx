import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Crop, ImageIcon, Loader2, Play, RotateCcw, FlaskConical } from "lucide-react";
import ReactCrop, { type Crop as CropType } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { isProduction } from "@/lib/env";
import {
  BACKGROUNDS,
  BG_LAB_MODELS,
  FRAME_ASPECT,
  cropImageBlob,
  drawBackground,
  drawCutoutCentered,
  removeBgWithModel,
  type BgLabModel,
  type CropRect,
} from "@/lib/imageUtils";

// ── small crop helpers (mirrors add-outfit) ───────────────────────────────
function cropToImagePixels(image: HTMLImageElement, crop: CropType): CropRect {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  return {
    x: Math.round((crop.x || 0) * scaleX),
    y: Math.round((crop.y || 0) * scaleY),
    w: Math.round((crop.width || 0) * scaleX),
    h: Math.round((crop.height || 0) * scaleY),
  };
}

// Composite WITHOUT the opaque-cutout guard, so even a failed (opaque) cutout
// still renders — that's diagnostic signal we want to see in the lab.
function compositeNoGuard(cutout: Blob, bgIndex: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(cutout);
    const img = new Image();
    img.onload = () => {
      const outH = 1200;
      const outW = Math.round(outH * FRAME_ASPECT);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      drawBackground(ctx, BACKGROUNDS[bgIndex], outW, outH);
      drawCutoutCentered(ctx, img, outW, outH);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas empty"))), "image/jpeg", 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// Checkerboard so cutout transparency (incl. translucent subject pixels) is visible.
const CHECKER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,#c8c8c8 25%,transparent 25%),linear-gradient(-45deg,#c8c8c8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c8c8c8 75%),linear-gradient(-45deg,transparent 75%,#c8c8c8 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
  backgroundColor: "#efefef",
};

type RunState = {
  status: "idle" | "running" | "done" | "error";
  cutout?: Blob;
  cutoutUrl?: string;
  compositeUrl?: string;
  clientMs?: number;
  serverMs?: number | null;
  transparentRatio?: number;
  error?: string;
};

type Phase = "pick" | "crop" | "compare";

export default function BgLab() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [phase, setPhase] = useState<Phase>("pick");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [selectedBg, setSelectedBg] = useState(0);
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  // Never expose this on production, even if someone knows the URL.
  useEffect(() => {
    if (isProduction) navigate("/");
  }, [navigate]);

  // Revoke all object URLs on unmount.
  useEffect(() => {
    return () => {
      if (croppedUrl) URL.revokeObjectURL(croppedUrl);
      Object.values(runs).forEach((r) => {
        if (r.cutoutUrl) URL.revokeObjectURL(r.cutoutUrl);
        if (r.compositeUrl) URL.revokeObjectURL(r.compositeUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please select an image file", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setCroppedBlob(null);
    setRuns({});
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
      setPhase("crop");
    };
    reader.readAsDataURL(file);
  };

  const onImageLoad = useCallback(() => {
    setCrop({ unit: "%", x: 32.5, y: 2.5, width: 35, height: 95 });
  }, []);

  const applyCrop = async () => {
    if (!imgRef.current || !crop || !crop.width || !crop.height || !selectedFile) return;
    try {
      const rect = cropToImagePixels(imgRef.current, crop);
      const blob = await cropImageBlob(selectedFile, rect, 2400, 0.92);
      setCroppedBlob(blob);
      setCroppedUrl(URL.createObjectURL(blob));
      // Seed each model as idle.
      const seed: Record<string, RunState> = {};
      for (const m of BG_LAB_MODELS) seed[m.key] = { status: "idle" };
      setRuns(seed);
      setPhase("compare");
    } catch {
      toast({ title: "Crop failed", variant: "destructive" });
    }
  };

  const runModel = useCallback(async (model: BgLabModel, source: Blob) => {
    setRuns((prev) => {
      // Revoke any previous URLs for this model before re-running.
      const old = prev[model.key];
      if (old?.cutoutUrl) URL.revokeObjectURL(old.cutoutUrl);
      if (old?.compositeUrl) URL.revokeObjectURL(old.compositeUrl);
      return { ...prev, [model.key]: { status: "running" } };
    });
    try {
      const { cutout, clientMs, serverMs, transparentRatio } = await removeBgWithModel(source, model.key);
      const cutoutUrl = URL.createObjectURL(cutout);
      let compositeUrl: string | undefined;
      try {
        const comp = await compositeNoGuard(cutout, selectedBg);
        compositeUrl = URL.createObjectURL(comp);
      } catch { /* composite render failed — leave undefined */ }
      setRuns((prev) => ({
        ...prev,
        [model.key]: { status: "done", cutout, cutoutUrl, compositeUrl, clientMs, serverMs, transparentRatio },
      }));
    } catch (err) {
      setRuns((prev) => ({
        ...prev,
        [model.key]: { status: "error", error: err instanceof Error ? err.message : "Failed" },
      }));
    }
  }, [selectedBg]);

  const runAll = useCallback(async () => {
    if (!croppedBlob) return;
    // Sequential — one model at a time keeps Replicate load sane and timings clean.
    for (const m of BG_LAB_MODELS) {
      // eslint-disable-next-line no-await-in-loop
      await runModel(m, croppedBlob);
    }
  }, [croppedBlob, runModel]);

  // When the background changes, re-composite every finished model's cutout.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = Object.entries(runs).filter(([, r]) => r.status === "done" && r.cutout);
      for (const [key, r] of entries) {
        try {
          const comp = await compositeNoGuard(r.cutout!, selectedBg);
          if (cancelled) return;
          const compositeUrl = URL.createObjectURL(comp);
          setRuns((prev) => {
            const cur = prev[key];
            if (!cur || cur.status !== "done") { URL.revokeObjectURL(compositeUrl); return prev; }
            if (cur.compositeUrl) URL.revokeObjectURL(cur.compositeUrl);
            return { ...prev, [key]: { ...cur, compositeUrl } };
          });
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBg]);

  const resetToPick = () => {
    setPhase("pick");
    setImagePreview(null);
    setSelectedFile(null);
    setCroppedBlob(null);
    setRuns({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const anyRunning = Object.values(runs).some((r) => r.status === "running");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <FlaskConical className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold text-foreground">BG Model Lab</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} data-testid="input-file" />

        {phase === "pick" && (
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center py-6 space-y-4 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <FlaskConical className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Compare background-removal models</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Pick one photo, crop it once, then run every model on the same crop.
                </p>
              </div>
              <Button className="gap-2" onClick={() => fileInputRef.current?.click()} data-testid="button-pick">
                <ImageIcon className="h-4 w-4" /> Choose photo
              </Button>
            </div>
          </Card>
        )}

        {phase === "crop" && imagePreview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Crop className="h-4 w-4" /> Crop (shared source for every model)
            </div>
            <ReactCrop crop={crop} onChange={(c) => setCrop(c)} minWidth={40} minHeight={40} className="max-h-[55vh] mx-auto">
              <img ref={imgRef} src={imagePreview} alt="Crop preview" onLoad={onImageLoad} className="max-h-[55vh] mx-auto" />
            </ReactCrop>
            <Button className="w-full gap-2" size="lg" onClick={applyCrop} data-testid="button-apply-crop">
              <Play className="h-5 w-5" /> Use this crop
            </Button>
            <Button variant="ghost" className="w-full" onClick={resetToPick} data-testid="button-change-photo">
              Change photo
            </Button>
          </div>
        )}

        {phase === "compare" && croppedUrl && (
          <div className="space-y-4">
            {/* Original (cropped) reference + controls */}
            <Card className="p-3">
              <div className="flex gap-3">
                <div className="w-24 shrink-0">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">Original crop</p>
                  <img src={croppedUrl} alt="Cropped source" className="w-full rounded-md border" data-testid="img-source" />
                </div>
                <div className="flex-1 space-y-2">
                  <Button className="w-full gap-2" size="sm" onClick={runAll} disabled={anyRunning} data-testid="button-run-all">
                    {anyRunning ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : <><Play className="h-4 w-4" /> Run all models</>}
                  </Button>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-muted-foreground mr-1">Composite bg:</span>
                    {BACKGROUNDS.map((bg, i) => (
                      <button
                        key={bg.name}
                        onClick={() => setSelectedBg(i)}
                        title={bg.name}
                        className={`w-6 h-6 rounded-full border-2 box-border ${selectedBg === i ? "border-primary scale-110" : "border-muted"}`}
                        style={{ background: bg.css }}
                        data-testid={`button-bg-${i}`}
                      />
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={resetToPick} data-testid="button-reset">
                    <RotateCcw className="h-3.5 w-3.5" /> New photo
                  </Button>
                </div>
              </div>
            </Card>

            {/* Per-model results */}
            <div className="space-y-3">
              {BG_LAB_MODELS.map((m) => {
                const r = runs[m.key] ?? { status: "idle" as const };
                return (
                  <Card key={m.key} className="p-3 space-y-2" data-testid={`card-model-${m.key}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{m.label}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {m.runsOn} · {m.cost}{m.note ? ` · ${m.note}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={r.status === "done" ? "outline" : "default"}
                        className="gap-1.5 shrink-0"
                        disabled={r.status === "running" || anyRunning}
                        onClick={() => croppedBlob && runModel(m, croppedBlob)}
                        data-testid={`button-run-${m.key}`}
                      >
                        {r.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        {r.status === "done" ? "Re-run" : "Run"}
                      </Button>
                    </div>

                    {r.status === "error" && (
                      <p className="text-xs text-destructive break-words" data-testid={`error-${m.key}`}>{r.error}</p>
                    )}

                    {(r.status === "done" || r.status === "running") && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Cutout (transparency)</p>
                          <div className="rounded-md overflow-hidden border aspect-[3/4] flex items-center justify-center" style={CHECKER}>
                            {r.cutoutUrl
                              ? <img src={r.cutoutUrl} alt="cutout" className="max-w-full max-h-full object-contain" data-testid={`img-cutout-${m.key}`} />
                              : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Full composite</p>
                          <div className="rounded-md overflow-hidden border aspect-[3/4] bg-muted flex items-center justify-center">
                            {r.compositeUrl
                              ? <img src={r.compositeUrl} alt="composite" className="max-w-full max-h-full object-contain" data-testid={`img-composite-${m.key}`} />
                              : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                          </div>
                        </div>
                      </div>
                    )}

                    {r.status === "done" && (
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums" data-testid={`stats-${m.key}`}>
                        {r.serverMs != null && <span>model {(r.serverMs / 1000).toFixed(1)}s</span>}
                        <span>total {((r.clientMs ?? 0) / 1000).toFixed(1)}s</span>
                        {r.transparentRatio != null && (
                          <span className={r.transparentRatio < 0.05 ? "text-destructive font-semibold" : ""}>
                            {(r.transparentRatio * 100).toFixed(0)}% transparent
                          </span>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
