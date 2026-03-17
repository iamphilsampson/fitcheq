import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Camera, Upload, ArrowLeft, Loader2, X, Image as ImageIcon, Crop, Clipboard } from "lucide-react";
import exifr from "exifr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { BACKGROUNDS, drawBackground, drawCutoutCentered, hasTransparency, compositeOnBackground } from "@/lib/imageUtils";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [isCropping, setIsCropping] = useState(false);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [dateWorn, setDateWorn] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [isPasteMode, setIsPasteMode] = useState(false);
  const [awaitingPaste, setAwaitingPaste] = useState(false);
  const [pastedBlob, setPastedBlob] = useState<Blob | null>(null);
  const [selectedBg, setSelectedBg] = useState(0);
  const [compositeBlob, setCompositeBlob] = useState<Blob | null>(null);
  const [isCompositing, setIsCompositing] = useState(false);

  const processPastedBlob = useCallback(async (blob: Blob) => {
    setAwaitingPaste(false);
    const transparent = await hasTransparency(blob);
    if (transparent) {
      setPastedBlob(blob);
      setSelectedBg(0);
      setIsPasteMode(true);
      setCompositeBlob(null);
      setImagePreview(null);
    } else {
      const url = URL.createObjectURL(blob);
      const file = new File([blob], "paste.jpg", { type: blob.type });
      setSelectedImage(file);
      setImagePreview(url);
      setIsCropping(true);
      setCroppedPreview(null);
      setCompositeBlob(null);
      setIsPasteMode(false);
    }
  }, []);

  useEffect(() => {
    const handleWindowPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      if (!imageItem) return;
      e.preventDefault();
      const blob = imageItem.getAsFile();
      if (blob) processPastedBlob(blob);
    };
    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [processPastedBlob]);

  useEffect(() => {
    if (!isPasteMode || !pastedBlob || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const bg = BACKGROUNDS[selectedBg];
    drawBackground(ctx, bg, canvas.width, canvas.height);
    const url = URL.createObjectURL(pastedBlob);
    const img = new Image();
    img.onload = () => { drawCutoutCentered(ctx, img, canvas.width, canvas.height); URL.revokeObjectURL(url); };
    img.src = url;
  }, [isPasteMode, pastedBlob, selectedBg]);

  const handlePasteButtonClick = () => {
    setAwaitingPaste(true);
    setTimeout(() => pasteZoneRef.current?.focus(), 50);
  };

  const handlePasteZoneEvent = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.type.startsWith("image/"));
    if (!imageItem) {
      toast({ title: "No image found", description: "Copy a photo first, then paste it here.", variant: "destructive" });
      setAwaitingPaste(false);
      return;
    }
    const blob = imageItem.getAsFile();
    if (blob) processPastedBlob(blob);
  };

  const handleComposite = async () => {
    if (!pastedBlob) return;
    setIsCompositing(true);
    try {
      const blob = await compositeOnBackground(pastedBlob, selectedBg);
      setCompositeBlob(blob);
      setImagePreview(URL.createObjectURL(blob));
      setIsPasteMode(false);
      setPastedBlob(null);
    } catch {
      toast({ title: "Failed to compose image", variant: "destructive" });
    } finally {
      setIsCompositing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please select an image file", variant: "destructive" });
      return;
    }
    setSelectedImage(file);
    setCroppedPreview(null);
    setCompositeBlob(null);
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
      setCroppedPreview(URL.createObjectURL(blob));
      setIsCropping(false);
    } catch {
      toast({ title: "Crop failed", variant: "destructive" });
      setIsCropping(false);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setCroppedPreview(null);
    setIsCropping(false);
    setIsPasteMode(false);
    setAwaitingPaste(false);
    setPastedBlob(null);
    setCompositeBlob(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    const hasImage = selectedImage || compositeBlob;
    if (!hasImage) {
      toast({ title: "No image selected", description: "Please select or capture an outfit photo", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      let uploadBlob: Blob;
      if (compositeBlob) {
        uploadBlob = compositeBlob;
      } else if (selectedImage) {
        uploadBlob = croppedPreview && imgRef.current && crop
          ? await getCroppedBlob(imgRef.current, crop)
          : selectedImage;
      } else {
        throw new Error("No image available");
      }

      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedImage?.name ?? "outfit.jpg", size: uploadBlob.size, contentType: "image/jpeg" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const upRes = await fetch(uploadURL, { method: "PUT", body: uploadBlob, headers: { "Content-Type": "image/jpeg" } });
      if (!upRes.ok) throw new Error("Failed to upload image");

      const outfitRes = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullImageUrl: objectPath, dateWorn, notes: notes || null }),
      });
      if (!outfitRes.ok) throw new Error("Failed to create outfit");

      const outfit = await outfitRes.json();
      navigate(`/reconcile/${outfit.id}`);
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Something went wrong", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const hasReadyImage = !!(selectedImage || compositeBlob);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (isPasteMode || awaitingPaste) ? clearImage() : navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold text-foreground">Add Outfit</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} data-testid="input-file" />

        {awaitingPaste ? (
          <div className="space-y-4">
            <div
              className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center p-10 gap-3 relative cursor-default"
              onClick={() => pasteZoneRef.current?.focus()}
              data-testid="paste-zone"
            >
              <Clipboard className="h-8 w-8 text-primary/50" />
              <p className="text-sm font-medium text-foreground">Long-press here and tap Paste</p>
              <p className="text-xs text-muted-foreground">Or press <span className="font-mono">⌘V</span> / <span className="font-mono">Ctrl+V</span></p>
              <div
                ref={pasteZoneRef}
                contentEditable
                suppressContentEditableWarning
                // @ts-expect-error inputMode="none" suppresses mobile keyboard
                inputMode="none"
                onPaste={handlePasteZoneEvent}
                className="absolute inset-0 opacity-0 outline-none rounded-xl"
                tabIndex={0}
                aria-label="Paste image here"
              />
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setAwaitingPaste(false)} data-testid="button-cancel-paste">
              Cancel
            </Button>
          </div>
        ) : isPasteMode && pastedBlob ? (
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
                    className={`block w-12 h-12 rounded-full border-2 transition-all ${selectedBg === i ? "border-foreground scale-110 shadow-md" : "border-transparent"}`}
                    style={{ background: bg.css }}
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{bg.name}</span>
                </button>
              ))}
            </div>

            <Button className="w-full gap-2" size="lg" onClick={handleComposite} disabled={isCompositing} data-testid="button-use-background">
              {isCompositing ? <><Loader2 className="h-5 w-5 animate-spin" /> Compositing...</> : <><Upload className="h-5 w-5" /> Use this background</>}
            </Button>
          </div>
        ) : !imagePreview ? (
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground text-sm">Capture Your Outfit</h3>
                <p className="text-xs text-muted-foreground mt-1">Take a photo, upload from gallery, or paste a cutout</p>
              </div>
              <div className="flex gap-2 w-full max-w-xs flex-wrap justify-center">
                <Button
                  variant="default"
                  className="flex-1 gap-2 min-w-[90px]"
                  onClick={() => { fileInputRef.current?.setAttribute("capture", "environment"); fileInputRef.current?.click(); }}
                  data-testid="button-camera"
                >
                  <Camera className="h-4 w-4" /> Camera
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 min-w-[90px]"
                  onClick={() => { fileInputRef.current?.removeAttribute("capture"); fileInputRef.current?.click(); }}
                  data-testid="button-gallery"
                >
                  <ImageIcon className="h-4 w-4" /> Gallery
                </Button>
                <Button variant="outline" className="flex-1 gap-2 min-w-[90px]" onClick={handlePasteButtonClick} data-testid="button-paste">
                  <Clipboard className="h-4 w-4" /> Paste
                </Button>
              </div>
            </div>
          </Card>
        ) : isCropping ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <Crop className="h-4 w-4" /> Crop your photo
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsCropping(false)} data-testid="button-skip-crop">Skip</Button>
                <Button size="sm" onClick={handleCropDone} data-testid="button-apply-crop">Apply</Button>
              </div>
            </div>
            <ReactCrop crop={crop} onChange={(c) => setCrop(c)} aspect={3 / 4} className="max-h-[60vh] mx-auto">
              <img ref={imgRef} src={imagePreview} alt="Crop preview" onLoad={onImageLoad} className="max-h-[60vh] mx-auto" />
            </ReactCrop>
          </div>
        ) : (
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

        {!isPasteMode && !awaitingPaste && (
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
