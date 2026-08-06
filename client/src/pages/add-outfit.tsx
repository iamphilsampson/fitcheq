import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Camera, Upload, ArrowLeft, ArrowRight, Loader2, X, Image as ImageIcon, Crop, Wand2, LogIn, Plus } from "lucide-react";
import exifr from "exifr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ReactCrop, { type Crop as CropType } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { BACKGROUNDS, drawBackground, drawCutoutCentered, removeBgFromBlob, compositeOnBackground, cropImageBlob, measureCutoutTransparency, BgRemovalTimeoutError, CutoutNotTransparentError, type BgRemovalProgress, type CropRect } from "@/lib/imageUtils";
import { Progress } from "@/components/ui/progress";
import CutoutEditor from "@/components/CutoutEditor";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const DRAFT_STORAGE_KEY = "fitcheck-outfit-draft";

interface OutfitDraft {
  dateWorn: string;
  notes: string;
  imageDataUrl?: string; // base64 data URL of the preview image
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mimeType = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function cropToImagePixels(image: HTMLImageElement, crop: CropType): CropRect {
  // ReactCrop reports crop in displayed (CSS) pixels regardless of unit; we
  // convert back to natural image pixels for downstream canvas work.
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  return {
    x: Math.round((crop.x || 0) * scaleX),
    y: Math.round((crop.y || 0) * scaleY),
    w: Math.round((crop.width || 0) * scaleX),
    h: Math.round((crop.height || 0) * scaleY),
  };
}

function getCroppedBlob(image: HTMLImageElement, crop: CropType): Promise<Blob> {
  const r = cropToImagePixels(image, crop);
  const canvas = document.createElement("canvas");
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas empty"))), "image/jpeg", 0.92)
  );
}

export default function AddOutfit() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  // Set false when the user leaves the removal step so an in-flight bg-removal
  // that resolves late is ignored (no force-jump to cleanup with a stale cutout).
  const bgActiveRef = useRef(false);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [isCropping, setIsCropping] = useState(false);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  // Crop rectangle in original-image pixel coordinates.
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  // Pixel dimensions of the original (uncropped) source photo. Captured when
  // the image element fires onLoad in the crop view. Used to size the
  // composite canvas from the full photo so the background fills the entire
  // original rectangle — not just the cropped area.
  const [origDims, setOrigDims] = useState<{ w: number; h: number } | null>(null);
  const [dateWorn, setDateWorn] = useState(new Date().toISOString().split("T")[0]);
  // Whether dateWorn came from the photo's EXIF metadata. When false we ask the
  // user to confirm the date on the tagging step instead of guessing silently.
  const [dateFromExif, setDateFromExif] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const [isRemoveBgStep, setIsRemoveBgStep] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState<BgRemovalProgress | null>(null);
  const [bgTimedOut, setBgTimedOut] = useState(false);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  // Optional manual cleanup of the cutout (erase/lasso) between bg-removal and
  // the background picker. Part of the "Background" step — no extra step number.
  const [isCleanupStep, setIsCleanupStep] = useState(false);
  const [isBgPickerMode, setIsBgPickerMode] = useState(false);
  const [selectedBg, setSelectedBg] = useState(0);
  const [compositeBlob, setCompositeBlob] = useState<Blob | null>(null);
  const [isCompositing, setIsCompositing] = useState(false);

  // Restore draft from localStorage if available (after sign-in redirect)
  useEffect(() => {
    if (!isAuthenticated) return;
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!savedDraft) return;
    try {
      const draft: OutfitDraft = JSON.parse(savedDraft);
      if (draft.dateWorn) setDateWorn(draft.dateWorn);
      // Restore image from data URL if available
      if (draft.imageDataUrl) {
        setImagePreview(draft.imageDataUrl);
        setCroppedPreview(draft.imageDataUrl);
        // Convert data URL back to a blob so it can be uploaded
        const blob = dataUrlToBlob(draft.imageDataUrl);
        setCroppedBlob(blob);
      }
    } catch {
      // ignore parse errors
    }
  }, [isAuthenticated]);

  // Fixed portrait 3:4 preview frame, matching compositeOnBackground's output
  // frame exactly (background fills the whole frame, subject centre-fit).
  const previewDims = { w: 450, h: 600 };
  const previewAspect = `${previewDims.w} / ${previewDims.h}`;

  // Redraw preview canvas whenever selected background changes in bg picker mode.
  // Mirrors compositeOnBackground (no-context path): centre-fit the cutout into
  // the frame so the subject fills it, rather than shrinking them into the full
  // original-photo rectangle.
  useEffect(() => {
    if (!isBgPickerMode || !cutoutBlob || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext("2d")!;
    drawBackground(ctx, BACKGROUNDS[selectedBg], canvas.width, canvas.height);
    const url = URL.createObjectURL(cutoutBlob);
    const img = new Image();
    img.onload = () => {
      drawCutoutCentered(ctx, img, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [isBgPickerMode, cutoutBlob, selectedBg, previewDims.w, previewDims.h]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please select an image file", variant: "destructive" });
      return;
    }
    setSelectedImage(file);
    setCroppedPreview(null);
    setCroppedBlob(null);
    setCropRect(null);
    setOrigDims(null);
    setCompositeBlob(null);
    bgActiveRef.current = false;
    setIsRemoveBgStep(false);
    setIsCleanupStep(false);
    setIsBgPickerMode(false);
    setCutoutBlob(null);
    setIsCropping(true);
    setDateFromExif(false);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    try {
      const exif = await exifr.parse(file, ["DateTimeOriginal", "CreateDate", "DateTime"]);
      const rawDate = exif?.DateTimeOriginal || exif?.CreateDate || exif?.DateTime;
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        const y = rawDate.getFullYear();
        const m = String(rawDate.getMonth() + 1).padStart(2, "0");
        const d = String(rawDate.getDate()).padStart(2, "0");
        setDateWorn(`${y}-${m}-${d}`);
        setDateFromExif(true);
      }
    } catch { }
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    // Capture the original photo dimensions so the composite canvas can be
    // sized from the full original photo rectangle (not just the crop area).
    setOrigDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
    // Free-form crop: default to a tall, narrow rectangle covering roughly
    // the centre third of the image. Optimised for full-body standing
    // portraits where the sides of the photo are usually room/clutter.
    // The user can drag any edge or corner from there.
    setCrop({ unit: "%", x: 32.5, y: 2.5, width: 35, height: 95 });
  }, []);

  const applyCrop = async (): Promise<Blob | null> => {
    if (!imgRef.current || !crop || !crop.width || !crop.height || !selectedImage) return null;
    // Invalidate any cached cutout/composite — they were crop-specific.
    setCutoutBlob(null);
    setCompositeBlob(null);
    setBgTimedOut(false);
    setIsCropping(false);
    try {
      const rect = cropToImagePixels(imgRef.current, crop);
      // Cap the cropped preview/upload at 2400px on the longest side.
      const blob = await cropImageBlob(selectedImage, rect, 2400, 0.92);
      setCropRect(rect);
      setCroppedBlob(blob);
      setCroppedPreview(URL.createObjectURL(blob));
      return blob;
    } catch {
      // Fallback to canvas-based crop from the displayed image element.
      try {
        const rect = cropToImagePixels(imgRef.current, crop);
        const blob = await getCroppedBlob(imgRef.current, crop);
        setCropRect(rect);
        setCroppedBlob(blob);
        setCroppedPreview(URL.createObjectURL(blob));
        return blob;
      } catch {
        toast({ title: "Crop failed", variant: "destructive" });
        return null;
      }
    }
  };

  // Crop + remove background in one action (no separate "remove bg" gate).
  const handleCropRemoveBg = async () => {
    // Enter the loading state up-front so there's no flash of the details or
    // recovery UI while the crop is being produced.
    setIsRemoveBgStep(true);
    setIsRemovingBg(true);
    setBgProgress(null);
    const blob = await applyCrop();
    if (!blob) {
      setIsRemovingBg(false);
      setIsRemoveBgStep(false);
      setIsCropping(true);
      return;
    }
    runBgRemoval(blob);
  };

  // Crop + skip background removal → save and go straight to tagging.
  const handleCropUseAsIs = async () => {
    const blob = await applyCrop();
    if (blob) await finishAndTag(blob, "cropped");
  };

  const runBgRemoval = async (sourceOverride?: Blob) => {
    // Reuse an existing cutout only when no fresh source is supplied (a fresh
    // cropped source always means we want to re-run against the new crop).
    if (!sourceOverride && cutoutBlob) {
      setIsRemoveBgStep(false);
      setIsCleanupStep(true);
      setSelectedBg(0);
      return;
    }
    // Prefer the freshly-cropped blob; fall back to the (pre-scaled) full image.
    let source: Blob | null = sourceOverride ?? croppedBlob;
    if (!source && selectedImage) {
      if (origDims && Math.max(origDims.w, origDims.h) > 2400) {
        source = await cropImageBlob(
          selectedImage,
          { x: 0, y: 0, w: origDims.w, h: origDims.h },
          2400,
          0.92
        );
      } else {
        source = selectedImage;
      }
    }
    if (!source) return;
    bgActiveRef.current = true;
    setIsRemovingBg(true);
    setBgProgress(null);
    setBgTimedOut(false);
    try {
      const cutout = await removeBgFromBlob(source, (p) => { if (bgActiveRef.current) setBgProgress(p); });
      if (!bgActiveRef.current) return; // user left the removal step — discard
      // Guard: if the segmenter returned an essentially-opaque image, we'd
      // produce a "fake" composite where the chosen background is fully covered
      // by the original photo. Detect and surface a clear message instead.
      const transparentRatio = await measureCutoutTransparency(cutout);
      if (!bgActiveRef.current) return;
      console.info(`[bg-removal] transparentRatio=${transparentRatio.toFixed(3)}`);
      if (transparentRatio < 0.05) {
        throw new CutoutNotTransparentError(transparentRatio);
      }
      setCutoutBlob(cutout);
      setIsRemoveBgStep(false);
      setIsCleanupStep(true);
      setSelectedBg(0);
      setCompositeBlob(null);
    } catch (err) {
      if (!bgActiveRef.current) return; // stale error after leaving the step
      if (err instanceof BgRemovalTimeoutError) {
        setBgTimedOut(true);
      } else if (err instanceof CutoutNotTransparentError) {
        toast({
          title: "Couldn't isolate the subject",
          description:
            "Background removal didn't find a clear person — try a different photo (avoid mirrors) or skip to upload as-is.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Background removal failed",
          description: "Try again or skip to upload as-is",
          variant: "destructive",
        });
      }
    } finally {
      setIsRemovingBg(false);
      setBgProgress(null);
    }
  };

  const handleSkipBgRemoval = async () => {
    bgActiveRef.current = false;
    setBgTimedOut(false);
    setIsRemoveBgStep(false);
    // Save the (cropped) photo as-is and go to tagging.
    const blob = croppedBlob ?? selectedImage;
    if (blob) await finishAndTag(blob, croppedBlob ? "cropped" : "raw");
  };

  // Leaving the optional cleanup step. `edited` is a fresh cutout when the user
  // erased/lassoed anything, else null (keep the original cutout untouched).
  const handleCleanupDone = (edited: Blob | null) => {
    if (edited) setCutoutBlob(edited);
    setIsCleanupStep(false);
    setIsBgPickerMode(true);
    setSelectedBg(0);
    setCompositeBlob(null);
  };

  const handleCustomBgSoon = () => {
    toast({ title: "Coming soon", description: "You'll be able to upload your own background here." });
  };

  const handleComposite = async () => {
    if (!cutoutBlob) return;
    setIsCompositing(true);
    try {
      // Centre-fit the cutout so the subject fills the frame (no full-photo
      // context — that shrank the person into the original rectangle). A future
      // pass will add manual drag + pinch-zoom on top of this default.
      const blob = await compositeOnBackground(cutoutBlob, selectedBg);
      setCompositeBlob(blob);
      setImagePreview(URL.createObjectURL(blob));
      setIsBgPickerMode(false);
      setCutoutBlob(null);
      // Save and continue to tagging. Keep the CROPPED (pre-composite) version as
      // the "original" — it has no baked-in background, so a later re-clean starts
      // from a clean source, and it's far smaller than the raw phone photo. Falls
      // back to the raw file only if the cropped blob is somehow missing.
      await finishAndTag(blob, "composite", croppedBlob ?? selectedImage);
    } catch (err) {
      if (err instanceof CutoutNotTransparentError) {
        toast({
          title: "Couldn't isolate the subject",
          description: "Background removal didn't find a clear person — try a different photo or skip to upload as-is.",
          variant: "destructive",
        });
        // Bounce back to the remove-bg step so the user can retry or skip.
        setIsBgPickerMode(false);
        setCutoutBlob(null);
        setIsRemoveBgStep(true);
      } else {
        toast({ title: "Failed to compose image", variant: "destructive" });
      }
    } finally {
      setIsCompositing(false);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setCroppedPreview(null);
    setCroppedBlob(null);
    setCropRect(null);
    setOrigDims(null);
    setIsCropping(false);
    setIsRemoveBgStep(false);
    setIsRemovingBg(false);
    bgActiveRef.current = false;
    setBgTimedOut(false);
    setCutoutBlob(null);
    setIsCleanupStep(false);
    setIsBgPickerMode(false);
    setCompositeBlob(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Save the outfit (date from EXIF or today, no notes) then go to the tagging
  // step. `originalBlob` is the raw pre-edit photo to keep for composites.
  const finishAndTag = async (
    uploadBlob: Blob,
    uploadSource: "composite" | "cropped" | "raw",
    originalBlob: Blob | null = null,
  ) => {
    // Guest path: preserve the work and prompt to sign in.
    if (!isAuthenticated) {
      const draft: OutfitDraft = { dateWorn, notes: "" };
      try {
        draft.imageDataUrl = await blobToDataUrl(uploadBlob);
      } catch { /* fall back to date only */ }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setShowSignInPrompt(true);
      return;
    }

    setIsUploading(true);
    try {
      console.info(`[upload-outfit] source=${uploadSource} bytes=${uploadBlob.size}`);

      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedImage?.name ?? "outfit.jpg", size: uploadBlob.size, contentType: "image/jpeg" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const upRes = await fetch(uploadURL, { method: "PUT", body: uploadBlob, headers: { "Content-Type": "image/jpeg" } });
      if (!upRes.ok) throw new Error("Failed to upload image");

      // For composites, also keep the raw original so outfit detail can offer a
      // "View original" toggle. Cropped/raw uploads ARE the original already.
      let originalImageUrl: string | null = null;
      let originalUploadFailed = false;
      if (originalBlob) {
        try {
          const origRes = await fetch("/api/uploads/request-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "outfit-original.jpg",
              size: originalBlob.size,
              contentType: originalBlob.type || "image/jpeg",
            }),
          });
          if (origRes.ok) {
            const { uploadURL: origUrl, objectPath: origPath } = await origRes.json();
            const origUp = await fetch(origUrl, {
              method: "PUT",
              body: originalBlob,
              headers: { "Content-Type": originalBlob.type || "image/jpeg" },
            });
            if (origUp.ok) originalImageUrl = origPath;
            else originalUploadFailed = true;
          } else {
            originalUploadFailed = true;
          }
        } catch (origErr) {
          originalUploadFailed = true;
          console.warn("[upload-outfit] failed to upload original photo:", origErr);
        }
      }

      const outfitRes = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullImageUrl: objectPath, originalImageUrl, dateWorn, notes: null }),
      });
      if (!outfitRes.ok) throw new Error("Failed to create outfit");

      const outfit = await outfitRes.json();
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      if (originalUploadFailed) {
        toast({
          title: "Saved without original",
          description: "We couldn't keep a copy of the raw photo. The composite was saved.",
        });
      }
      // Go straight to tagging as the final step. Ask for the date there only
      // when we couldn't read it from the photo's metadata.
      navigate(`/reconcile/${outfit.id}?new=1${dateFromExif ? "" : "&askdate=1"}`);
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Something went wrong", variant: "destructive" });
      // Escape the "Saving…" screen back to crop so the user can retry.
      setIsCropping(true);
    } finally {
      setIsUploading(false);
    }
  };

  // Flow step for the progress indicator. 0 = pre-flow (pick a photo).
  // 1 Crop · 2 Background · 3 Tag items (the last step lives on the reconcile
  // page). In this screen we're only ever on step 1 or 2.
  const flowStep = isCropping ? 1 : imagePreview ? 2 : 0;
  const STEP_LABELS = ["", "Crop", "Background", "Tag items"];
  const TOTAL_STEPS = 3;

  const handleBack = () => {
    // Any back-navigation cancels an in-flight bg-removal (ignore late results).
    bgActiveRef.current = false;
    if (isBgPickerMode) {
      // Background removal is automatic now, so "back" from the picker returns
      // to the cleanup step (re-erase), which itself can go back to crop.
      setIsBgPickerMode(false);
      setIsRemoveBgStep(false);
      setIsCleanupStep(true);
    } else if (isCleanupStep) {
      // Back from cleanup returns to crop (re-crop clears the cached cutout).
      setIsCleanupStep(false);
      setIsRemoveBgStep(false);
      setIsCropping(true);
    } else if (isRemoveBgStep) {
      // Removal is in-flight/failed — cancel back to crop.
      setIsRemoveBgStep(false);
      setIsCropping(true);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Sign-in prompt modal for guests */}
      <Dialog open={showSignInPrompt} onOpenChange={setShowSignInPrompt}>
        <DialogContent data-testid="dialog-sign-in-prompt">
          <DialogHeader>
            <DialogTitle>Sign in to save your outfit</DialogTitle>
            <DialogDescription>
              Create a free account to save your outfits permanently. Your outfit details have been preserved — they'll be waiting for you after you sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Button
              className="w-full gap-2"
              onClick={() => { window.location.reload(); }}
              data-testid="button-sign-in-prompt"
            >
              <LogIn className="h-4 w-4" />
              Sign in with Google
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setShowSignInPrompt(false)}
              data-testid="button-cancel-sign-in"
            >
              Continue without signing in
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold text-foreground">Add Outfit</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} data-testid="input-file" />

        {flowStep >= 1 && (
          <div className="space-y-1.5" data-testid="flow-stepper">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Step {flowStep} of {TOTAL_STEPS}</span>
              <span className="text-xs text-muted-foreground">{STEP_LABELS[flowStep]}</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-colors ${n <= flowStep ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
          </div>
        )}

        {isCleanupStep && cutoutBlob ? (
          // Part of step 2 (Background): optional manual cleanup of the cutout.
          <CutoutEditor cutoutBlob={cutoutBlob} onDone={handleCleanupDone} onBack={handleBack} />

        ) : isBgPickerMode && cutoutBlob ? (
          // Step 4: Background picker
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Pick a background</p>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearImage} data-testid="button-change-photo">
                Change photo
              </Button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-muted flex items-center justify-center">
              <canvas
                ref={previewCanvasRef}
                width={previewDims.w}
                height={previewDims.h}
                className="max-w-full max-h-[60vh] w-auto h-auto"
                style={{ aspectRatio: previewAspect, display: "block" }}
                data-testid="canvas-preview"
              />

              {/* Scrollable, translucent swatch bar floating over the image bottom.
                  Gradient keeps the names legible while staying see-through. */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/45 via-black/20 to-transparent backdrop-blur-[1px]">
                <div className="flex gap-3 overflow-x-auto px-3 py-2.5">
                  {BACKGROUNDS.map((bg, i) => (
                    <button
                      key={bg.name}
                      onClick={() => setSelectedBg(i)}
                      className="flex-shrink-0 flex flex-col items-center gap-1"
                      data-testid={`button-bg-${i}`}
                      title={bg.name}
                    >
                      <span
                        className={`block w-11 h-11 shrink-0 aspect-square rounded-full border-2 box-border transition-all ${selectedBg === i ? "border-white scale-110 shadow-md" : "border-white/40"}`}
                        style={{ background: bg.css }}
                      />
                      <span className="text-[10px] text-white/90 whitespace-nowrap">{bg.name}</span>
                    </button>
                  ))}

                  {/* Coming-soon: upload your own background. */}
                  <button
                    onClick={handleCustomBgSoon}
                    className="flex-shrink-0 flex flex-col items-center gap-1"
                    data-testid="button-bg-custom"
                    title="Your own background (coming soon)"
                  >
                    <span className="relative flex w-11 h-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/50 text-white/80">
                      <Plus className="h-5 w-5" />
                      <span className="absolute -top-1 -right-1 rounded-full bg-white/90 px-1 text-[8px] font-bold uppercase tracking-wide text-zinc-900">soon</span>
                    </span>
                    <span className="text-[10px] text-white/90 whitespace-nowrap">Your own</span>
                  </button>
                </div>
              </div>
            </div>

            <Button className="w-full gap-2" size="lg" onClick={handleComposite} disabled={isCompositing} data-testid="button-use-background">
              {isCompositing
                ? <><Loader2 className="h-5 w-5 animate-spin" /> Applying background...</>
                : <>Next: Tag items <ArrowRight className="h-5 w-5" /></>}
            </Button>
            <Button
              variant="ghost"
              className="w-full gap-2"
              onClick={() => { setIsBgPickerMode(false); setIsCleanupStep(true); }}
              disabled={isCompositing}
              data-testid="button-edit-cutout"
            >
              <ArrowLeft className="h-4 w-4" /> Edit cut-out
            </Button>
          </div>

        ) : isRemoveBgStep ? (
          // Step 3: Remove background choice
          <div className="space-y-4">
            <Card className="overflow-hidden">
              {/* Capped so the action buttons below stay on-screen. A processing
                  overlay makes the loading state obvious on the image itself. */}
              <div className="relative flex items-center justify-center bg-muted">
                <img
                  src={croppedPreview || imagePreview || ""}
                  alt="Your photo"
                  className={`max-h-[50vh] max-w-full object-contain transition-opacity ${isRemovingBg ? "opacity-30" : ""}`}
                />
                {isRemovingBg && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
                    <Loader2 className="h-9 w-9 animate-spin text-primary" />
                    <p className="text-sm font-semibold text-foreground">
                      {!bgProgress ? "Starting up…"
                        : bgProgress.phase === "download" ? "Downloading the AI model…"
                        : "Removing the background…"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {!bgProgress ? "Getting things ready"
                        : bgProgress.phase === "download" ? "One-time setup — this won't happen again"
                        : "Finding you and cutting out the scene"}
                    </p>
                    {bgProgress && bgProgress.phase !== "server" && (
                      <p className="text-xs font-semibold text-primary tabular-nums">{bgProgress.percent}%</p>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <div className="space-y-2">
              {isRemovingBg ? (
                bgProgress?.phase === "server" ? (
                  <div className="relative h-1.5 rounded-full overflow-hidden bg-primary/20" data-testid="progress-remove-bg-indeterminate">
                    <div className="absolute inset-y-0 w-1/2 bg-primary rounded-full animate-indeterminate" />
                  </div>
                ) : (
                  <Progress value={bgProgress?.percent ?? 0} className="h-1.5" data-testid="progress-remove-bg" />
                )
              ) : (
                // Only reached if background removal failed or timed out — offer recovery.
                <>
                  <p className="text-xs text-center text-muted-foreground">
                    {bgTimedOut ? "That took longer than expected." : "Couldn't remove the background."} Try again or use the photo as-is.
                  </p>
                  <Button className="w-full gap-2" size="lg" onClick={() => runBgRemoval()} data-testid="button-remove-bg">
                    <Wand2 className="h-5 w-5" /> Try again
                  </Button>
                  <Button variant="ghost" className="w-full" size="lg" onClick={handleSkipBgRemoval} data-testid="button-skip-bg-removal">
                    Use photo as-is
                  </Button>
                </>
              )}
            </div>
          </div>

        ) : !imagePreview ? (
          // Step 1: Pick image
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground text-sm">Capture Your Outfit</h3>
                <p className="text-xs text-muted-foreground mt-1">Take a photo or upload from your gallery</p>
              </div>
              <div className="flex gap-2 w-full max-w-xs justify-center">
                <Button
                  variant="default"
                  className="flex-1 gap-2"
                  onClick={() => { fileInputRef.current?.setAttribute("capture", "environment"); fileInputRef.current?.click(); }}
                  data-testid="button-camera"
                >
                  <Camera className="h-4 w-4" /> Camera
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => { fileInputRef.current?.removeAttribute("capture"); fileInputRef.current?.click(); }}
                  data-testid="button-gallery"
                >
                  <ImageIcon className="h-4 w-4" /> Gallery
                </Button>
              </div>
            </div>
          </Card>

        ) : isCropping ? (
          // Step 2: Crop
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Crop className="h-4 w-4" /> Crop your photo
            </div>
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              minWidth={40}
              minHeight={40}
              className="max-h-[55vh] mx-auto"
            >
              <img ref={imgRef} src={imagePreview} alt="Crop preview" onLoad={onImageLoad} className="max-h-[55vh] mx-auto" />
            </ReactCrop>
            <Button className="w-full gap-2" size="lg" onClick={handleCropRemoveBg} data-testid="button-crop-removebg">
              <Wand2 className="h-5 w-5" /> Remove background
            </Button>
            <Button variant="ghost" className="w-full" size="lg" onClick={handleCropUseAsIs} data-testid="button-crop-asis">
              Use photo as-is <ArrowRight className="h-5 w-5" />
            </Button>
          </div>

        ) : (
          // Finalizing: crop/composite is done, the outfit is being saved, then
          // we move to the tagging step. No date/notes step any more.
          <div className="relative rounded-xl overflow-hidden bg-muted flex items-center justify-center min-h-[40vh]">
            <img
              src={(compositeBlob ? imagePreview : croppedPreview || imagePreview) || undefined}
              alt="Outfit preview"
              className="w-full h-auto max-h-[70vh] object-contain block opacity-40"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <Loader2 className="h-9 w-9 animate-spin text-primary" />
              <p className="text-sm font-semibold text-foreground">Saving your outfit…</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
