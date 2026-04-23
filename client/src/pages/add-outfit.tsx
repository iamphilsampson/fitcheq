import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Camera, Upload, ArrowLeft, Loader2, X, Image as ImageIcon, Crop, Wand2, LogIn } from "lucide-react";
import exifr from "exifr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { BACKGROUNDS, drawBackground, drawCutoutCentered, removeBgFromBlob, compositeOnBackground, measureCutoutTransparency, BgRemovalTimeoutError, CutoutNotTransparentError, type BgRemovalProgress } from "@/lib/imageUtils";
import { Progress } from "@/components/ui/progress";
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

function getCroppedBlob(image: HTMLImageElement, crop: CropType): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const pxCrop = {
    x: (crop.x || 0) * scaleX,
    y: (crop.y || 0) * scaleY,
    width: (crop.width || 0) * scaleX,
    height: (crop.height || 0) * scaleY,
  };
  canvas.width = pxCrop.width;
  canvas.height = pxCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, pxCrop.x, pxCrop.y, pxCrop.width, pxCrop.height, 0, 0, pxCrop.width, pxCrop.height);
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

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [isCropping, setIsCropping] = useState(false);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [dateWorn, setDateWorn] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const [isRemoveBgStep, setIsRemoveBgStep] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState<BgRemovalProgress | null>(null);
  const [bgTimedOut, setBgTimedOut] = useState(false);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
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
      if (draft.notes) setNotes(draft.notes);
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

  // Redraw preview canvas whenever selected background changes in bg picker mode
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
  }, [isBgPickerMode, cutoutBlob, selectedBg]);

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
    setCompositeBlob(null);
    setIsRemoveBgStep(false);
    setIsBgPickerMode(false);
    setCutoutBlob(null);
    setIsCropping(true);
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
      }
    } catch { }
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, 3 / 4, width, height), width, height));
  }, []);

  const handleCropDone = async () => {
    if (!imgRef.current || !crop) return;
    try {
      const blob = await getCroppedBlob(imgRef.current, crop);
      setCroppedBlob(blob);
      setCroppedPreview(URL.createObjectURL(blob));
      setIsCropping(false);
      setIsRemoveBgStep(true);
    } catch {
      toast({ title: "Crop failed", variant: "destructive" });
      setIsCropping(false);
    }
  };

  const handleSkipCrop = () => {
    setIsCropping(false);
    setIsRemoveBgStep(true);
  };

  const handleRemoveBg = async () => {
    // If we already computed a cutout (e.g. user went back from picker), reuse it
    if (cutoutBlob) {
      setIsRemoveBgStep(false);
      setIsBgPickerMode(true);
      setSelectedBg(0);
      return;
    }
    const source = croppedBlob || selectedImage;
    if (!source) return;
    setIsRemovingBg(true);
    setBgProgress(null);
    setBgTimedOut(false);
    try {
      const cutout = await removeBgFromBlob(source, (p) => setBgProgress(p));
      // Guard: if the segmenter returned an essentially-opaque image, we'd
      // produce a "fake" composite where the chosen background is fully covered
      // by the original photo. Detect and surface a clear message instead.
      const transparentRatio = await measureCutoutTransparency(cutout);
      console.info(`[bg-removal] transparentRatio=${transparentRatio.toFixed(3)}`);
      if (transparentRatio < 0.05) {
        throw new CutoutNotTransparentError(transparentRatio);
      }
      setCutoutBlob(cutout);
      setIsRemoveBgStep(false);
      setIsBgPickerMode(true);
      setSelectedBg(0);
      setCompositeBlob(null);
    } catch (err) {
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

  const handleSkipBgRemoval = () => {
    setBgTimedOut(false);
    setIsRemoveBgStep(false);
  };

  const handleComposite = async () => {
    if (!cutoutBlob) return;
    setIsCompositing(true);
    try {
      const blob = await compositeOnBackground(cutoutBlob, selectedBg);
      setCompositeBlob(blob);
      setImagePreview(URL.createObjectURL(blob));
      setIsBgPickerMode(false);
      setCutoutBlob(null);
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
    setIsCropping(false);
    setIsRemoveBgStep(false);
    setIsRemovingBg(false);
    setBgTimedOut(false);
    setCutoutBlob(null);
    setIsBgPickerMode(false);
    setCompositeBlob(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    const hasImage = selectedImage || compositeBlob;
    if (!hasImage) {
      toast({ title: "No image selected", description: "Please select or capture an outfit photo", variant: "destructive" });
      return;
    }

    // If user is not authenticated, show sign-in prompt and save draft to localStorage
    if (!isAuthenticated) {
      const draft: OutfitDraft = { dateWorn, notes };
      // Try to save image as base64 data URL so we can restore after sign-in
      try {
        const blobToSave = compositeBlob || croppedBlob || (selectedImage || null);
        if (blobToSave) {
          draft.imageDataUrl = await blobToDataUrl(blobToSave);
        } else if (croppedPreview && croppedPreview.startsWith("data:")) {
          draft.imageDataUrl = croppedPreview;
        }
      } catch {
        // If we can't serialize the image, just save date/notes
      }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setShowSignInPrompt(true);
      return;
    }

    setIsUploading(true);
    try {
      let uploadBlob: Blob;
      let uploadSource: "composite" | "cropped" | "raw";
      if (compositeBlob) {
        uploadBlob = compositeBlob;
        uploadSource = "composite";
      } else if (croppedBlob) {
        uploadBlob = croppedBlob;
        uploadSource = "cropped";
      } else if (selectedImage) {
        uploadBlob = selectedImage;
        uploadSource = "raw";
      } else {
        throw new Error("No image available");
      }
      console.info(
        `[upload-outfit] source=${uploadSource} bytes=${uploadBlob.size}`
      );

      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedImage?.name ?? "outfit.jpg", size: uploadBlob.size, contentType: "image/jpeg" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const upRes = await fetch(uploadURL, { method: "PUT", body: uploadBlob, headers: { "Content-Type": "image/jpeg" } });
      if (!upRes.ok) throw new Error("Failed to upload image");

      // If we composited onto a chosen background, also upload the truly raw
      // original (pre-crop, pre-bg-removal) so the outfit detail page can
      // offer a "View original" toggle later. For cropped/raw uploads, the
      // displayed image IS the original — nothing extra to store.
      let originalImageUrl: string | null = null;
      let originalUploadFailed = false;
      if (uploadSource === "composite" && selectedImage) {
        try {
          const origRes = await fetch("/api/uploads/request-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: selectedImage.name ?? "outfit-original.jpg",
              size: selectedImage.size,
              contentType: selectedImage.type || "image/jpeg",
            }),
          });
          if (origRes.ok) {
            const { uploadURL: origUrl, objectPath: origPath } = await origRes.json();
            const origUp = await fetch(origUrl, {
              method: "PUT",
              body: selectedImage,
              headers: { "Content-Type": selectedImage.type || "image/jpeg" },
            });
            if (origUp.ok) {
              originalImageUrl = origPath;
              console.info(`[upload-outfit] original bytes=${selectedImage.size} path=${origPath}`);
            } else {
              originalUploadFailed = true;
            }
          } else {
            originalUploadFailed = true;
          }
        } catch (origErr) {
          // Non-fatal: outfit still saves with just the composite.
          originalUploadFailed = true;
          console.warn("[upload-outfit] failed to upload original photo:", origErr);
        }
      }

      const outfitRes = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullImageUrl: objectPath, originalImageUrl, dateWorn, notes: notes || null }),
      });
      if (!outfitRes.ok) throw new Error("Failed to create outfit");

      const outfit = await outfitRes.json();
      // Clear any guest draft after successful save
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      // Soft-fail notice: outfit saved fine, but the user won't have the
      // "View original" toggle on this one. Non-blocking by design.
      if (originalUploadFailed) {
        toast({
          title: "Saved without original",
          description: "We couldn't keep a copy of the raw photo. The composite was saved.",
        });
      }
      navigate(`/reconcile/${outfit.id}`);
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Something went wrong", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const hasReadyImage = !!(selectedImage || compositeBlob);

  const handleBack = () => {
    if (isBgPickerMode) {
      // Keep cutoutBlob so re-entering bg picker skips the ML model run
      setIsBgPickerMode(false);
      setIsRemoveBgStep(true);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
              onClick={() => { window.location.href = "/api/login"; }}
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

        {isBgPickerMode && cutoutBlob ? (
          // Step 4: Background picker
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Pick a background</p>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearImage} data-testid="button-change-photo">
                Change photo
              </Button>
            </div>

            <div className="rounded-xl overflow-hidden bg-muted">
              <canvas
                ref={previewCanvasRef}
                width={300}
                height={400}
                className="w-full"
                style={{ aspectRatio: "3/4", display: "block" }}
                data-testid="canvas-preview"
              />
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              {BACKGROUNDS.map((bg, i) => (
                <button
                  key={bg.name}
                  onClick={() => setSelectedBg(i)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1.5 transition-opacity ${selectedBg === i ? "opacity-100" : "opacity-55 hover:opacity-80"}`}
                  data-testid={`button-bg-${i}`}
                  title={bg.name}
                >
                  <span
                    className={`block w-12 h-12 shrink-0 aspect-square rounded-full border-2 box-border transition-all ${selectedBg === i ? "border-foreground scale-110 shadow-md" : "border-transparent"}`}
                    style={{ background: bg.css }}
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{bg.name}</span>
                </button>
              ))}
            </div>

            <Button className="w-full gap-2" size="lg" onClick={handleComposite} disabled={isCompositing} data-testid="button-use-background">
              {isCompositing
                ? <><Loader2 className="h-5 w-5 animate-spin" /> Compositing...</>
                : <><Upload className="h-5 w-5" /> Use this background</>}
            </Button>
          </div>

        ) : isRemoveBgStep ? (
          // Step 3: Remove background choice
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="aspect-[3/4] bg-muted">
                <img
                  src={croppedPreview || imagePreview || ""}
                  alt="Your photo"
                  className="w-full h-full object-cover"
                />
              </div>
            </Card>

            <div className="space-y-2">
              {bgTimedOut ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3 text-center" data-testid="container-bg-timeout">
                  <p className="text-sm font-medium text-foreground">Background removal timed out</p>
                  <p className="text-xs text-muted-foreground">The server is taking longer than expected. You can try again or skip and upload as-is.</p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 gap-2"
                      size="sm"
                      onClick={handleRemoveBg}
                      data-testid="button-retry-bg"
                    >
                      <Wand2 className="h-4 w-4" /> Try again
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      size="sm"
                      onClick={handleSkipBgRemoval}
                      data-testid="button-skip-after-timeout"
                    >
                      Skip
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    className="w-full gap-2"
                    size="lg"
                    onClick={handleRemoveBg}
                    disabled={isRemovingBg}
                    data-testid="button-remove-bg"
                  >
                    {isRemovingBg
                      ? <><Loader2 className="h-5 w-5 animate-spin" /> Removing background...</>
                      : <><Wand2 className="h-5 w-5" /> Remove Background</>}
                  </Button>
                  {isRemovingBg && (
                    <>
                      {bgProgress?.phase === "server" ? (
                        <>
                          <div
                            className="relative h-1.5 rounded-full overflow-hidden bg-primary/20"
                            data-testid="progress-remove-bg-indeterminate"
                          >
                            <div className="absolute inset-y-0 w-1/2 bg-primary rounded-full animate-indeterminate" />
                          </div>
                          <p className="text-xs text-center text-muted-foreground" data-testid="text-bg-status">
                            Removing background… this may take up to 30 seconds
                          </p>
                        </>
                      ) : (
                        <>
                          <Progress
                            value={bgProgress?.percent ?? 0}
                            className="h-1.5"
                            data-testid="progress-remove-bg"
                          />
                          <p className="text-xs text-center text-muted-foreground" data-testid="text-bg-status">
                            {bgProgress?.phase === "download"
                              ? "Downloading the background-removal model (one-time)"
                              : "Processing your photo"}
                          </p>
                        </>
                      )}
                    </>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full"
                    size="lg"
                    onClick={handleSkipBgRemoval}
                    disabled={isRemovingBg}
                    data-testid="button-skip-bg-removal"
                  >
                    Skip — upload as-is
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
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <Crop className="h-4 w-4" /> Crop your photo
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleSkipCrop} data-testid="button-skip-crop">Skip</Button>
                <Button size="sm" onClick={handleCropDone} data-testid="button-apply-crop">Apply</Button>
              </div>
            </div>
            <ReactCrop crop={crop} onChange={(c) => setCrop(c)} aspect={3 / 4} className="max-h-[60vh] mx-auto">
              <img ref={imgRef} src={imagePreview} alt="Crop preview" onLoad={onImageLoad} className="max-h-[60vh] mx-auto" />
            </ReactCrop>
          </div>

        ) : (
          // Step 5: Preview + submit
          <div className="relative">
            <Card className="overflow-hidden">
              <div className="aspect-[3/4] bg-muted relative">
                <img ref={imgRef} src={croppedPreview || imagePreview} alt="Outfit preview" className="w-full h-full object-cover" />
              </div>
            </Card>
            <div className="absolute top-2 right-2 flex gap-2">
              {!compositeBlob && (
                <Button variant="secondary" size="icon" className="rounded-full shadow-md h-8 w-8" onClick={() => setIsCropping(true)} data-testid="button-recrop">
                  <Crop className="h-4 w-4" />
                </Button>
              )}
              <Button variant="secondary" size="icon" className="rounded-full shadow-md h-8 w-8" onClick={clearImage} data-testid="button-clear-image">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {compositeBlob && (
              <p className="text-xs text-muted-foreground text-center mt-2">{BACKGROUNDS[selectedBg].name} background</p>
            )}
          </div>
        )}

        {!isBgPickerMode && !isRemoveBgStep && (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="date" className="text-sm">Date Worn</Label>
                <Input id="date" type="date" value={dateWorn} onChange={(e) => setDateWorn(e.target.value)} data-testid="input-date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-sm">Notes (optional)</Label>
                <Textarea id="notes" placeholder="Where did you wear this? Any occasion?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="input-notes" />
              </div>
            </div>
            <Button className="w-full gap-2" size="lg" onClick={handleSubmit} disabled={!hasReadyImage || isUploading || isCropping} data-testid="button-submit">
              {isUploading ? <><Loader2 className="h-5 w-5 animate-spin" /> Saving...</> : <><Upload className="h-5 w-5" /> Save Outfit</>}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
