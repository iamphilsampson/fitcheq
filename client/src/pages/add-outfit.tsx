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

const BACKGROUNDS = [
  {
    name: "Chalk",
    type: "solid" as const,
    color: "#F5F2EE",
    css: "#F5F2EE",
  },
  {
    name: "Sand Drift",
    type: "radial" as const,
    inner: "#F0E4C8",
    outer: "#C49A6C",
    css: "radial-gradient(circle at 40% 35%, #F0E4C8, #C49A6C)",
  },
  {
    name: "Lilac Mist",
    type: "radial" as const,
    inner: "#E8DDFF",
    outer: "#A48FD8",
    css: "radial-gradient(circle at 40% 35%, #E8DDFF, #A48FD8)",
  },
  {
    name: "Peach Haze",
    type: "linear" as const,
    from: "#FDECD2",
    to: "#E8856A",
    angle: 140,
    css: "linear-gradient(140deg, #FDECD2, #E8856A)",
  },
  {
    name: "Slate Deep",
    type: "linear" as const,
    from: "#363B4E",
    to: "#181C2A",
    angle: 155,
    css: "linear-gradient(155deg, #363B4E, #181C2A)",
  },
  {
    name: "Sage Blur",
    type: "radial" as const,
    inner: "#D4E8CC",
    outer: "#839E7E",
    css: "radial-gradient(circle at 40% 35%, #D4E8CC, #839E7E)",
  },
] as const;

type Background = (typeof BACKGROUNDS)[number];

function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number) {
  if (bg.type === "solid") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, w, h);
  } else if (bg.type === "radial") {
    const cx = w * 0.4;
    const cy = h * 0.35;
    const r = Math.max(w, h) * 0.75;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, bg.inner);
    grad.addColorStop(1, bg.outer);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (bg.type === "linear") {
    const rad = (bg.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const len = Math.abs(w * cos) + Math.abs(h * sin);
    const x1 = w / 2 - (cos * len) / 2;
    const y1 = h / 2 - (sin * len) / 2;
    const x2 = w / 2 + (cos * len) / 2;
    const y2 = h / 2 + (sin * len) / 2;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, bg.from);
    grad.addColorStop(1, bg.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawCutoutCentered(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

async function hasTransparency(blob: Blob): Promise<boolean> {
  if (!blob.type.includes("png")) return false;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      URL.revokeObjectURL(url);
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) { resolve(true); return; }
      }
      resolve(false);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

function getCroppedBlob(image: HTMLImageElement, crop: CropType): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const pixelCrop = {
    x: (crop.x || 0) * scaleX,
    y: (crop.y || 0) * scaleY,
    width: (crop.width || 0) * scaleX,
    height: (crop.height || 0) * scaleY,
  };
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error("Canvas is empty")); },
      "image/jpeg",
      0.92
    );
  });
}

const canPaste =
  typeof navigator !== "undefined" &&
  "clipboard" in navigator &&
  typeof (navigator.clipboard as Clipboard & { read?: () => Promise<ClipboardItems> }).read === "function";

export default function AddOutfit() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [isCropping, setIsCropping] = useState(false);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [dateWorn, setDateWorn] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [isPasteMode, setIsPasteMode] = useState(false);
  const [pastedBlob, setPastedBlob] = useState<Blob | null>(null);
  const [selectedBg, setSelectedBg] = useState(0);
  const [compositeBlob, setCompositeBlob] = useState<Blob | null>(null);
  const [isCompositing, setIsCompositing] = useState(false);

  useEffect(() => {
    if (!isPasteMode || !pastedBlob || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d")!;
    const bg = BACKGROUNDS[selectedBg];
    drawBackground(ctx, bg, W, H);
    const url = URL.createObjectURL(pastedBlob);
    const img = new Image();
    img.onload = () => {
      drawCutoutCentered(ctx, img, W, H);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [isPasteMode, pastedBlob, selectedBg]);

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

  const handlePaste = async () => {
    try {
      const clipboardItems = await (navigator.clipboard as Clipboard & { read: () => Promise<ClipboardItems> }).read();
      let imageBlob: Blob | null = null;
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            imageBlob = await item.getType(type);
            break;
          }
        }
        if (imageBlob) break;
      }
      if (!imageBlob) {
        toast({ title: "No image found", description: "Copy an image first, then paste it here.", variant: "destructive" });
        return;
      }
      const transparent = await hasTransparency(imageBlob);
      if (transparent) {
        setPastedBlob(imageBlob);
        setSelectedBg(0);
        setIsPasteMode(true);
        setCompositeBlob(null);
        setImagePreview(null);
      } else {
        const url = URL.createObjectURL(imageBlob);
        const file = new File([imageBlob], "paste.jpg", { type: imageBlob.type });
        setSelectedImage(file);
        setImagePreview(url);
        setIsCropping(true);
        setCroppedPreview(null);
        setCompositeBlob(null);
        setIsPasteMode(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("denied") || msg.includes("permission") || msg.includes("allowed")) {
        toast({ title: "Clipboard access denied", description: "Allow clipboard access when prompted.", variant: "destructive" });
      } else {
        toast({ title: "Paste not available", description: "Try using the Gallery option instead.", variant: "destructive" });
      }
    }
  };

  const handleComposite = async () => {
    if (!pastedBlob) return;
    setIsCompositing(true);
    try {
      const W = 900;
      const H = 1200;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      drawBackground(ctx, BACKGROUNDS[selectedBg], W, H);
      await new Promise<void>((resolve) => {
        const url = URL.createObjectURL(pastedBlob);
        const img = new Image();
        img.onload = () => { drawCutoutCentered(ctx, img, W, H); URL.revokeObjectURL(url); resolve(); };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        img.src = url;
      });
      canvas.toBlob((blob) => {
        if (!blob) { toast({ title: "Failed to compose", variant: "destructive" }); return; }
        const previewUrl = URL.createObjectURL(blob);
        setCompositeBlob(blob);
        setImagePreview(previewUrl);
        setIsPasteMode(false);
        setPastedBlob(null);
        setIsCompositing(false);
      }, "image/jpeg", 0.92);
    } catch {
      toast({ title: "Failed to compose image", variant: "destructive" });
      setIsCompositing(false);
    }
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const newCrop = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, 3 / 4, width, height), width, height);
    setCrop(newCrop);
  }, []);

  const handleCropDone = async () => {
    if (!imgRef.current || !crop) return;
    try {
      const blob = await getCroppedBlob(imgRef.current, crop);
      setCroppedPreview(URL.createObjectURL(blob));
      setIsCropping(false);
    } catch {
      toast({ title: "Crop failed", description: "Could not crop the image, using original", variant: "destructive" });
      setIsCropping(false);
    }
  };

  const handleCameraCapture = () => {
    fileInputRef.current?.setAttribute("capture", "environment");
    fileInputRef.current?.click();
  };

  const handleGallerySelect = () => {
    fileInputRef.current?.removeAttribute("capture");
    fileInputRef.current?.click();
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setCroppedPreview(null);
    setIsCropping(false);
    setIsPasteMode(false);
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
        if (croppedPreview && imgRef.current && crop) {
          uploadBlob = await getCroppedBlob(imgRef.current, crop);
        } else {
          uploadBlob = selectedImage;
        }
      } else {
        throw new Error("No image available");
      }

      const urlResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedImage?.name ?? "outfit.jpg",
          size: uploadBlob.size,
          contentType: "image/jpeg",
        }),
      });
      if (!urlResponse.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlResponse.json();

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: uploadBlob,
        headers: { "Content-Type": "image/jpeg" },
      });
      if (!uploadResponse.ok) throw new Error("Failed to upload image");

      const outfitResponse = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullImageUrl: objectPath, dateWorn, notes: notes || null }),
      });
      if (!outfitResponse.ok) throw new Error("Failed to create outfit");

      const outfit = await outfitResponse.json();
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
            onClick={() => isPasteMode ? clearImage() : navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold text-foreground">Add Outfit</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
          data-testid="input-file"
        />

        {isPasteMode && pastedBlob ? (
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
                  className={`flex-shrink-0 flex flex-col items-center gap-1.5 ${selectedBg === i ? "opacity-100" : "opacity-60 hover:opacity-80"} transition-opacity`}
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

            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleComposite}
              disabled={isCompositing}
              data-testid="button-use-background"
            >
              {isCompositing ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Compositing...</>
              ) : (
                <><Upload className="h-5 w-5" /> Use this background</>
              )}
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
                <p className="text-xs text-muted-foreground mt-1">
                  Take a photo, upload from gallery, or paste a cutout
                </p>
              </div>
              <div className="flex gap-2 w-full max-w-xs flex-wrap justify-center">
                <Button variant="default" className="flex-1 gap-2 min-w-[100px]" onClick={handleCameraCapture} data-testid="button-camera">
                  <Camera className="h-4 w-4" />
                  Camera
                </Button>
                <Button variant="outline" className="flex-1 gap-2 min-w-[100px]" onClick={handleGallerySelect} data-testid="button-gallery">
                  <ImageIcon className="h-4 w-4" />
                  Gallery
                </Button>
                {canPaste && (
                  <Button variant="outline" className="flex-1 gap-2 min-w-[100px]" onClick={handlePaste} data-testid="button-paste">
                    <Clipboard className="h-4 w-4" />
                    Paste
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ) : isCropping ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <Crop className="h-4 w-4" />
                Crop your photo
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsCropping(false)} data-testid="button-skip-crop">
                  Skip
                </Button>
                <Button size="sm" onClick={handleCropDone} data-testid="button-apply-crop">
                  Apply
                </Button>
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
                <img
                  ref={imgRef}
                  src={croppedPreview || imagePreview}
                  alt="Outfit preview"
                  className="w-full h-full object-cover"
                />
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

        {!isPasteMode && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-sm">Date Worn</Label>
              <Input id="date" type="date" value={dateWorn} onChange={(e) => setDateWorn(e.target.value)} data-testid="input-date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Where did you wear this? Any occasion?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                data-testid="input-notes"
              />
            </div>
          </div>
        )}

        {!isPasteMode && (
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={handleSubmit}
            disabled={!hasReadyImage || isUploading || isCropping}
            data-testid="button-submit"
          >
            {isUploading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Saving...</>
            ) : (
              <><Upload className="h-5 w-5" /> Save Outfit</>
            )}
          </Button>
        )}
      </main>
    </div>
  );
}
