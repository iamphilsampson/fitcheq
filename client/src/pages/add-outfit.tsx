import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Camera, Upload, ArrowLeft, Loader2, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function AddOutfit() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dateWorn, setDateWorn] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
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
      // Step 1: Request presigned URL
      const urlResponse = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedImage.name,
          size: selectedImage.size,
          contentType: selectedImage.type,
        }),
      });

      if (!urlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await urlResponse.json();

      // Step 2: Upload image directly to storage
      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: selectedImage,
        headers: { "Content-Type": selectedImage.type },
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }

      // Step 3: Send to AI analysis endpoint
      const analysisResponse = await fetch("/api/outfits/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: objectPath,
          dateWorn,
          notes,
        }),
      });

      if (!analysisResponse.ok) {
        throw new Error("Failed to analyze outfit");
      }

      const { outfitId, detectedItems } = await analysisResponse.json();

      // Navigate to reconciliation page
      navigate(`/reconcile/${outfitId}?items=${encodeURIComponent(JSON.stringify(detectedItems))}`);
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
        <div className="px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Add Outfit</h1>
            <p className="text-xs text-muted-foreground">Capture your look</p>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
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
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground">Capture Your Outfit</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Take a photo or upload from your gallery
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
        ) : (
          <div className="relative">
            <Card className="overflow-hidden">
              <div className="aspect-[3/4] bg-muted relative">
                <img
                  src={imagePreview}
                  alt="Outfit preview"
                  className="w-full h-full object-cover"
                />
              </div>
            </Card>
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 rounded-full shadow-md"
              onClick={clearImage}
              data-testid="button-clear-image"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date Worn</Label>
            <Input
              id="date"
              type="date"
              value={dateWorn}
              onChange={(e) => setDateWorn(e.target.value)}
              data-testid="input-date"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Where did you wear this? Any occasion?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="input-notes"
            />
          </div>
        </div>

        <Button
          className="w-full gap-2"
          size="lg"
          onClick={handleSubmit}
          disabled={!selectedImage || isUploading}
          data-testid="button-submit"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Analyzing outfit...
            </>
          ) : (
            <>
              <Upload className="h-5 w-5" />
              Upload & Analyze
            </>
          )}
        </Button>
      </main>
    </div>
  );
}
