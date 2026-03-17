import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Camera, Upload, ArrowLeft, Loader2, X, Image as ImageIcon, Crop } from "lucide-react";
import exifr from "exifr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ReactCrop, { type Crop as CropType, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

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
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas is empty"));
      },
      "image/jpeg",
      0.92
    );
  });
}

export default function AddOutfit() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropType>();
  const [isCropping, setIsCropping] = useState(false);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [dateWorn, setDateWorn] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }

      setSelectedImage(file);
      setCroppedPreview(null);
      setIsCropping(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
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
      } catch {
        // No EXIF or unreadable — keep current date
      }
    }
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const newCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, 3 / 4, width, height),
      width,
      height
    );
    setCrop(newCrop);
  }, []);

  const handleCropDone = async () => {
    if (!imgRef.current || !crop) return;
    try {
      const blob = await getCroppedBlob(imgRef.current, crop);
      const url = URL.createObjectURL(blob);
      setCroppedPreview(url);
      setIsCropping(false);
    } catch {
      toast({
        title: "Crop failed",
        description: "Could not crop the image, using original",
        variant: "destructive",
      });
      setIsCropping(false);
    }
  };

  const handleCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("capture", "environment");
      fileInputRef.current.click();
    }
  };

  const handleGallerySelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute("capture");
      fileInputRef.current.click();
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setCroppedPreview(null);
    setIsCropping(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!selectedImage) {
      toast({
        title: "No image selected",
        description: "Please select or capture an outfit photo",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      let uploadBlob: Blob = selectedImage;
      if (croppedPreview && imgRef.current && crop) {
        uploadBlob = await getCroppedBlob(imgRef.current, crop);
      }

      const urlResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedImage.name,
          size: uploadBlob.size,
          contentType: "image/jpeg",
        }),
      });

      if (!urlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await urlResponse.json();

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: uploadBlob,
        headers: { "Content-Type": "image/jpeg" },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }

      const outfitResponse = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullImageUrl: objectPath,
          dateWorn,
          notes: notes || null,
        }),
      });

      if (!outfitResponse.ok) {
        throw new Error("Failed to create outfit");
      }

      const outfit = await outfitResponse.json();
      navigate(`/reconcile/${outfit.id}`);
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate("/")}
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

        {!imagePreview ? (
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground text-sm">Capture Your Outfit</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Take a photo or upload from gallery
                </p>
              </div>
              <div className="flex gap-3 w-full max-w-xs">
                <Button
                  variant="default"
                  className="flex-1 gap-2"
                  onClick={handleCameraCapture}
                  data-testid="button-camera"
                >
                  <Camera className="h-4 w-4" />
                  Camera
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleGallerySelect}
                  data-testid="button-gallery"
                >
                  <ImageIcon className="h-4 w-4" />
                  Gallery
                </Button>
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
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              aspect={3 / 4}
              className="max-h-[60vh] mx-auto"
            >
              <img
                ref={imgRef}
                src={imagePreview}
                alt="Crop preview"
                onLoad={onImageLoad}
                className="max-h-[60vh] mx-auto"
              />
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
              <Button
                variant="secondary"
                size="icon"
                className="rounded-full shadow-md h-8 w-8"
                onClick={() => setIsCropping(true)}
                data-testid="button-recrop"
              >
                <Crop className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="rounded-full shadow-md h-8 w-8"
                onClick={clearImage}
                data-testid="button-clear-image"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="date" className="text-sm">Date Worn</Label>
            <Input
              id="date"
              type="date"
              value={dateWorn}
              onChange={(e) => setDateWorn(e.target.value)}
              data-testid="input-date"
            />
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

        <Button
          className="w-full gap-2"
          size="lg"
          onClick={handleSubmit}
          disabled={!selectedImage || isUploading || isCropping}
          data-testid="button-submit"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Upload className="h-5 w-5" />
              Save Outfit
            </>
          )}
        </Button>
      </main>
    </div>
  );
}
