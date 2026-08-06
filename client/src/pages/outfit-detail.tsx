import { useState, useRef, useCallback, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Tag, X, MoreVertical, Trash2, Camera, Image as ImageIcon, ChevronLeft, ChevronRight, Wand2, Upload, History, Plus, Crop } from "lucide-react";
import ReactCrop, { type Crop as CropType } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { BACKGROUNDS, drawBackground, drawCutoutCentered, removeBgFromBlob, compositeOnBackground, measureCutoutTransparency, downscaleImageBlob, cropImageBlob, CutoutNotTransparentError, type BgRemovalProgress, type CropRect } from "@/lib/imageUtils";
import { Progress } from "@/components/ui/progress";
import CutoutEditor from "@/components/CutoutEditor";
import type { Outfit, Item } from "@shared/schema";

interface OutfitWithItems extends Outfit {
  items: Item[];
}

interface OutfitSummary {
  id: number;
  dateWorn: string;
  fullImageUrl: string;
  itemCount: number;
}

type UploadSource = "composite" | "raw";

// ReactCrop reports the crop in displayed (CSS) pixels; convert to natural
// image pixels for cropImageBlob. (Same helper as the add-outfit flow.)
function cropToImagePixels(image: HTMLImageElement, c: CropType): CropRect {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  return {
    x: Math.round((c.x || 0) * scaleX),
    y: Math.round((c.y || 0) * scaleY),
    w: Math.round((c.width || 0) * scaleX),
    h: Math.round((c.height || 0) * scaleY),
  };
}

export default function OutfitDetail() {
  const [, params] = useRoute("/outfits/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Core UI state
  const [isReuploading, setIsReuploading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);

  // Background removal pipeline state
  const [selectedFileBlob, setSelectedFileBlob] = useState<Blob | null>(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null);
  const [isRemoveBgStep, setIsRemoveBgStep] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState<BgRemovalProgress | null>(null);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  // Crop step before bg-removal (re-clean / replace) — lets the user trim side
  // clutter, matching the add flow, so re-cleaned cut-outs aren't noisier.
  const [isCropStep, setIsCropStep] = useState(false);
  const [crop, setCrop] = useState<CropType>();
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  // Optional manual cleanup (erase/lasso) of the cutout, between bg-removal and
  // the background picker — mirrors the add-outfit flow.
  const [isCleanupStep, setIsCleanupStep] = useState(false);
  const [isBgPickerMode, setIsBgPickerMode] = useState(false);
  const [selectedBg, setSelectedBg] = useState(0);
  const [isCompositing, setIsCompositing] = useState(false);
  // True when we're running bg removal on the existing outfit photo (no source picker step)
  const [isCurrentPhotoBgFlow, setIsCurrentPhotoBgFlow] = useState(false);

  // Cancellation guard for async bg-removal operations.
  // Set to false whenever the user exits the flow so in-flight results are ignored.
  const bgRemovalActiveRef = useRef(false);

  // Touch swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // "View original photo" toggle state — only meaningful when the outfit has
  // a stored originalImageUrl (i.e. it was composited from a raw photo).
  const [viewingOriginal, setViewingOriginal] = useState(false);
  // Photo display mode: "fit" shows the whole frame, "fill" zooms to show more
  // detail. Toggled by tapping the centre of the photo.
  const [imageFit, setImageFit] = useState<"fit" | "fill">("fit");

  const outfitId = params?.id ? parseInt(params.id) : null;

  // Reset per-outfit view toggles whenever we navigate to a different outfit.
  useEffect(() => {
    setViewingOriginal(false);
    setImageFit("fit");
  }, [outfitId]);

  // Radix can leave `pointer-events: none` on <body> if an AlertDialog unmounts
  // (e.g. we navigate away after Delete) before its close cleanup runs, which
  // freezes the destination page. Restore it whenever this page unmounts.
  useEffect(() => {
    return () => { document.body.style.pointerEvents = ""; };
  }, []);

  const { data: outfit, isLoading } = useQuery<OutfitWithItems>({
    queryKey: ["/api/outfits", outfitId],
    enabled: !!outfitId,
  });

  const { data: allOutfits } = useQuery<OutfitSummary[]>({
    queryKey: ["/api/outfits"],
  });

  const currentIndex = allOutfits?.findIndex((o) => o.id === outfitId) ?? -1;
  const prevId = currentIndex > 0 ? allOutfits![currentIndex - 1].id : null;
  const nextId = allOutfits && currentIndex < allOutfits.length - 1 ? allOutfits[currentIndex + 1].id : null;
  const totalCount = allOutfits?.length ?? 0;
  // The list is newest-first (index 0 = newest). Number chronologically so the
  // oldest outfit is 1 and the newest is N, matching the ascending id.
  const positionLabel = currentIndex >= 0 && totalCount > 1 ? `${totalCount - currentIndex} / ${totalCount}` : null;

  // Redraw preview canvas whenever bg selection changes in picker mode
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

  const goToOutfit = useCallback((id: number) => {
    navigate(`/outfits/${id}`);
  }, [navigate]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && nextId) goToOutfit(nextId);
      if (dx > 0 && prevId) goToOutfit(prevId);
    }
  };

  // Reset all photo-editing state and close the editing mode.
  // Also cancels any in-flight bg-removal so stale async results are ignored.
  const resetPhotoEditState = useCallback(() => {
    bgRemovalActiveRef.current = false;
    setShowPhotoOptions(false);
    setSelectedFileBlob(null);
    setSelectedFilePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setIsCropStep(false);
    setCrop(undefined);
    setCroppedBlob(null);
    setIsRemoveBgStep(false);
    setIsRemovingBg(false);
    setBgProgress(null);
    setCutoutBlob(null);
    setIsCleanupStep(false);
    setIsBgPickerMode(false);
    setIsCompositing(false);
    setIsCurrentPhotoBgFlow(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Upload the new photo and PATCH the outfit. When `originalBlob` is provided
  // (composite path with a fresh raw photo) we also upload it and patch
  // originalImageUrl. When source==="raw", the displayed image IS the original
  // so we clear any previously-stored original. When source==="composite"
  // without an originalBlob (e.g. re-removing bg from the current photo), we
  // leave originalImageUrl untouched to preserve any existing original.
  const uploadBlobAndPatch = useCallback(async (
    blob: Blob,
    source: UploadSource = "raw",
    originalBlob: Blob | null = null,
  ) => {
    setIsReuploading(true);
    console.info(`[upload-outfit-patch] outfitId=${outfitId} source=${source} bytes=${blob.size} hasOriginal=${!!originalBlob}`);
    try {
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "outfit.jpg", size: blob.size, contentType: "image/jpeg" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const upRes = await fetch(uploadURL, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
      if (!upRes.ok) throw new Error("Failed to upload image");

      const patchBody: { fullImageUrl: string; originalImageUrl?: string | null } = {
        fullImageUrl: objectPath,
      };

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
            if (origUp.ok) {
              patchBody.originalImageUrl = origPath;
            } else {
              originalUploadFailed = true;
            }
          } else {
            originalUploadFailed = true;
          }
        } catch (origErr) {
          originalUploadFailed = true;
          console.warn("[upload-outfit-patch] failed to upload original photo:", origErr);
        }
        // If we tried to capture a new original but couldn't, the previously-
        // stored original belongs to the *old* fullImage and is now stale.
        // Clear it so the toggle disappears rather than showing an unrelated
        // photo from the previous outfit state.
        if (originalUploadFailed) {
          patchBody.originalImageUrl = null;
        }
      } else if (source === "raw") {
        // Replacing with a raw/skip photo — the new fullImage IS the original,
        // so any previously-stored original is no longer meaningful.
        patchBody.originalImageUrl = null;
      }

      await apiRequest("PATCH", `/api/outfits/${outfitId}`, patchBody);
      queryClient.invalidateQueries({ queryKey: ["/api/outfits", outfitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      setViewingOriginal(false);
      if (originalUploadFailed) {
        toast({
          title: "Updated without original",
          description: "We couldn't keep a copy of the raw photo. The composite was saved.",
        });
      } else {
        toast({ title: "Photo updated", description: "Outfit photo has been replaced." });
      }
      resetPhotoEditState();
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Something went wrong", variant: "destructive" });
    } finally {
      setIsReuploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [outfitId, resetPhotoEditState, toast]);

  // File picked via Replace Photo → crop step, then removal.
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setSelectedFileBlob(file);
    setSelectedFilePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setCutoutBlob(null);
    setCroppedBlob(null);
    setCrop(undefined);
    setIsBgPickerMode(false);
    setIsRemoveBgStep(false);
    setIsCropStep(true);
  };

  // Default crop when the crop image loads (trims side clutter; user adjusts).
  const onCropImageLoad = () => {
    setCrop({ unit: "%", x: 15, y: 2.5, width: 70, height: 95 });
  };

  // Resolve the blob to crop: the picked file (Replace) or the current source
  // URL (re-clean), fetched on demand.
  const getCropSourceBlob = async (): Promise<Blob | null> => {
    if (selectedFileBlob) return selectedFileBlob;
    if (selectedFilePreview) {
      try {
        const res = await fetch(selectedFilePreview);
        if (res.ok) return await res.blob();
      } catch { /* fall through */ }
    }
    return null;
  };

  const cropCurrentImage = async (): Promise<Blob | null> => {
    if (!cropImgRef.current || !crop?.width || !crop?.height) return null;
    const src = await getCropSourceBlob();
    if (!src) { toast({ title: "Couldn't load the photo", variant: "destructive" }); return null; }
    try {
      const rect = cropToImagePixels(cropImgRef.current, crop);
      return await cropImageBlob(src, rect, 2400, 0.92);
    } catch {
      toast({ title: "Crop failed", variant: "destructive" });
      return null;
    }
  };

  // Run bg-removal on an already-cropped blob → cleanup step.
  const runRemoval = async (sourceBlob: Blob) => {
    bgRemovalActiveRef.current = true;
    setIsCropStep(false);
    setIsRemoveBgStep(true);
    setIsRemovingBg(true);
    setBgProgress(null);
    try {
      const cutout = await removeBgFromBlob(sourceBlob, (p) => { if (bgRemovalActiveRef.current) setBgProgress(p); });
      if (!bgRemovalActiveRef.current) return;
      const transparentRatio = await measureCutoutTransparency(cutout);
      if (!bgRemovalActiveRef.current) return;
      console.info(`[bg-removal] transparentRatio=${transparentRatio.toFixed(3)}`);
      if (transparentRatio < 0.05) throw new CutoutNotTransparentError(transparentRatio);
      setCutoutBlob(cutout);
      setIsRemoveBgStep(false);
      setIsCleanupStep(true);
      setSelectedBg(0);
    } catch (err) {
      if (!bgRemovalActiveRef.current) return;
      if (err instanceof CutoutNotTransparentError) {
        toast({ title: "Couldn't isolate the subject", description: "Try adjusting the crop, a different photo, or cancel.", variant: "destructive" });
      } else {
        toast({ title: "Background removal failed", description: "Try again.", variant: "destructive" });
      }
      setIsRemoveBgStep(false);
      setIsCropStep(true); // back to crop to adjust/retry
    } finally {
      setIsRemovingBg(false);
      setBgProgress(null);
    }
  };

  const handleCropThenRemove = async () => {
    const cropped = await cropCurrentImage();
    if (!cropped) return;
    setCroppedBlob(cropped);
    await runRemoval(cropped);
  };

  // Replace flow only: skip removal, upload the cropped photo as-is.
  const handleCropThenSkip = async () => {
    const cropped = await cropCurrentImage();
    if (cropped) await uploadBlobAndPatch(cropped, "raw");
  };

  // Leaving the optional cleanup step → continue to the background picker.
  const handleCleanupDone = (edited: Blob | null) => {
    if (edited) setCutoutBlob(edited);
    setIsCleanupStep(false);
    setIsBgPickerMode(true);
    setSelectedBg(0);
  };

  // From the picker → back to the cutout editor, edits preserved (cutoutBlob).
  const backToCleanup = () => {
    setIsBgPickerMode(false);
    setIsCleanupStep(true);
  };

  const handleCustomBgSoon = () => {
    toast({ title: "Coming soon", description: "You'll be able to upload your own background here." });
  };

  // Composite cutout onto chosen background and upload immediately
  const handleComposite = async () => {
    if (!cutoutBlob) return;
    setIsCompositing(true);
    try {
      const blob = await compositeOnBackground(cutoutBlob, selectedBg);
      setIsCompositing(false); // switch button to "Uploading..." state
      // If a fresh photo was just picked (Replace Photo), preserve a downscaled
      // copy as the new original (smaller than a raw phone shot, still a clean
      // re-clean source). If we're re-removing bg from the current outfit photo,
      // leave originalImageUrl untouched.
      // Replace flow: store the CROPPED photo (downscaled) as the new original —
      // smaller and already trimmed. Re-clean of the current photo leaves the
      // stored original untouched (so it stays pristine for future re-crops).
      let originalForUpload: Blob | null = null;
      if (!isCurrentPhotoBgFlow) {
        const base = croppedBlob ?? selectedFileBlob;
        if (base) {
          try {
            originalForUpload = await downscaleImageBlob(base, 2000, 0.9);
          } catch {
            originalForUpload = base;
          }
        }
      }
      await uploadBlobAndPatch(blob, "composite", originalForUpload);
    } catch (err) {
      if (err instanceof CutoutNotTransparentError) {
        toast({
          title: "Couldn't isolate the subject",
          description: "Background removal didn't find a clear person — try a different photo or cancel.",
          variant: "destructive",
        });
        resetPhotoEditState();
      } else {
        toast({ title: "Failed to compose image", variant: "destructive" });
      }
      setIsCompositing(false);
    }
  };

  // Re-clean the current outfit photo → crop step, then removal. Sources from the
  // stored original (pristine, no baked-in background) when present, else the
  // current photo. The crop <img> loads the source URL directly; the blob is
  // fetched on demand at crop-confirm (getCropSourceBlob).
  const handleRemoveCurrentBg = () => {
    if (!outfit) return;
    const source = outfit.originalImageUrl ?? outfit.fullImageUrl;
    setShowPhotoOptions(true);
    setIsCurrentPhotoBgFlow(true);
    setSelectedFileBlob(null);
    setSelectedFilePreview(source);
    setCutoutBlob(null);
    setCroppedBlob(null);
    setCrop(undefined);
    setIsBgPickerMode(false);
    setIsRemoveBgStep(false);
    setIsCleanupStep(false);
    setIsCropStep(true);
  };

  // Back button / cancel logic
  const cancelPhotoEdit = () => {
    if (isBgPickerMode) {
      // From bg picker → back to the cleanup step (cutout preserved).
      setIsBgPickerMode(false);
      setIsCleanupStep(true);
    } else if (isCleanupStep) {
      // From cleanup → back to the crop step (re-crop / re-run).
      setIsCleanupStep(false);
      setIsCropStep(true);
    } else if (isRemoveBgStep) {
      // Removal in flight → cancel it and return to crop.
      bgRemovalActiveRef.current = false;
      setIsRemoveBgStep(false);
      setIsRemovingBg(false);
      setIsCropStep(true);
    } else if (isCropStep) {
      if (isCurrentPhotoBgFlow) {
        resetPhotoEditState();
      } else {
        // Replace flow → back to the source picker.
        setIsCropStep(false);
        setSelectedFileBlob(null);
        setSelectedFilePreview((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return null;
        });
        setCutoutBlob(null);
        setCroppedBlob(null);
      }
    } else {
      resetPhotoEditState();
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/outfits/${outfitId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      toast({ title: "Outfit deleted", description: "The outfit has been removed." });
      // Return to the list rather than an adjacent outfit — jumping to the next
      // outfit left the back button pointing at the just-deleted one.
      navigate("/");
    },
    onError: (error) => {
      toast({ title: "Failed to delete", description: error instanceof Error ? error.message : "Something went wrong", variant: "destructive" });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: number) => { await apiRequest("DELETE", `/api/outfits/${outfitId}/items/${itemId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outfits", outfitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      toast({ title: "Item removed", description: "Item unlinked from this outfit." });
    },
    onError: (error) => {
      toast({ title: "Failed to remove", description: error instanceof Error ? error.message : "Something went wrong", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
          <div className="px-4 py-2 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-5 w-5" /></Button>
            <Skeleton className="h-5 w-32" />
          </div>
        </header>
        <main className="p-4 space-y-4">
          <Skeleton className="aspect-[3/4] rounded-lg" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </main>
      </div>
    );
  }

  if (!outfit) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-semibold">Outfit not found</h2>
          <Button variant="link" onClick={() => navigate("/")}>Go back home</Button>
        </div>
      </div>
    );
  }

  const formattedDate = new Date(outfit.dateWorn + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  const isEditingPhoto = showPhotoOptions;

  // Derive header title from current editing state
  let headerTitle = formattedDate;
  if (isBgPickerMode) headerTitle = "Pick a background";
  else if (isCleanupStep) headerTitle = "Clean up";
  else if (isCropStep || isRemoveBgStep) headerTitle = "Crop";
  else if (showPhotoOptions) headerTitle = isCurrentPhotoBgFlow ? "Remove Background" : "Replace Photo";

  return (
    <div className="min-h-dvh bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-reupload"
      />

      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => isEditingPhoto ? cancelPhotoEdit() : navigate("/")}
              data-testid="button-back"
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-semibold text-foreground truncate min-w-0">
              {headerTitle}
            </h1>
          </div>
          {!isEditingPhoto && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/reconcile/${outfitId}`)} data-testid="button-tag-items">
                <Tag className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-menu">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => setShowPhotoOptions(true)}
                    disabled={isReuploading}
                    data-testid="menu-replace-photo"
                  >
                    <Camera className="h-4 w-4" /> Replace Photo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleRemoveCurrentBg}
                    disabled={isReuploading}
                    data-testid="menu-remove-bg"
                  >
                    <Wand2 className="h-4 w-4" /> Remove Background
                  </DropdownMenuItem>
                  {outfit.originalImageUrl && (
                    <DropdownMenuItem
                      onClick={() => setViewingOriginal((v) => !v)}
                      data-testid="menu-view-original"
                    >
                      <History className="h-4 w-4" /> {viewingOriginal ? "View edited photo" : "View original photo"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                    data-testid="menu-delete"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Outfit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>

      <main className="p-4 space-y-4">
        {showPhotoOptions ? (
          isCleanupStep && cutoutBlob ? (
            // Optional manual cleanup of the cutout (erase / lasso).
            <CutoutEditor cutoutBlob={cutoutBlob} onDone={handleCleanupDone} onBack={cancelPhotoEdit} />

          ) : isBgPickerMode && cutoutBlob ? (
            // Background picker — mirrors the Add Outfit flow (translucent bar
            // over a 3:4 preview, "Your own" placeholder, edit-cutout back).
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">Pick a background</p>

              <div className="relative rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                <canvas
                  ref={previewCanvasRef}
                  width={450}
                  height={600}
                  className="max-w-full max-h-[60vh] w-auto h-auto"
                  style={{ aspectRatio: "450 / 600", display: "block" }}
                  data-testid="canvas-preview"
                />

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

              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleComposite}
                disabled={isCompositing || isReuploading}
                data-testid="button-use-background"
              >
                {isCompositing
                  ? <><Loader2 className="h-5 w-5 animate-spin" /> Compositing...</>
                  : isReuploading
                    ? <><Loader2 className="h-5 w-5 animate-spin" /> Uploading...</>
                    : <><Upload className="h-5 w-5" /> Use this background</>}
              </Button>
              <Button
                variant="ghost"
                className="w-full gap-2"
                onClick={backToCleanup}
                disabled={isCompositing || isReuploading}
                data-testid="button-edit-cutout"
              >
                <ArrowLeft className="h-4 w-4" /> Edit cut-out
              </Button>
            </div>

          ) : isCropStep ? (
            // Crop step — trim clutter before removal (matches the add flow).
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Crop className="h-4 w-4" /> Crop your photo
              </div>
              <ReactCrop crop={crop} onChange={(c) => setCrop(c)} minWidth={40} minHeight={40} className="max-h-[55vh] mx-auto">
                <img ref={cropImgRef} src={selectedFilePreview || ""} alt="Crop preview" onLoad={onCropImageLoad} className="max-h-[55vh] mx-auto" />
              </ReactCrop>
              <Button className="w-full gap-2" size="lg" onClick={handleCropThenRemove} data-testid="button-crop-removebg">
                <Wand2 className="h-5 w-5" /> Remove background
              </Button>
              {!isCurrentPhotoBgFlow && (
                <Button variant="ghost" className="w-full" size="lg" onClick={handleCropThenSkip} disabled={isReuploading} data-testid="button-crop-asis">
                  {isReuploading ? <><Loader2 className="h-5 w-5 animate-spin" /> Uploading...</> : "Use photo as-is"}
                </Button>
              )}
            </div>

          ) : isRemoveBgStep ? (
            // Removing… progress (auto-runs after crop).
            <div className="space-y-3">
              <Card className="overflow-hidden">
                <div className="relative flex items-center justify-center bg-muted">
                  <img src={selectedFilePreview || ""} alt="Your photo" className="max-h-[50vh] max-w-full object-contain opacity-30" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
                    <Loader2 className="h-9 w-9 animate-spin text-primary" />
                    <p className="text-sm font-semibold text-foreground">
                      {!bgProgress ? "Starting up…" : bgProgress.phase === "download" ? "Downloading the AI model…" : "Removing the background…"}
                    </p>
                    {bgProgress && bgProgress.phase !== "server" && (
                      <p className="text-xs font-semibold text-primary tabular-nums">{bgProgress.percent}%</p>
                    )}
                  </div>
                </div>
              </Card>
              <Progress value={bgProgress?.percent ?? 0} className="h-1.5" data-testid="progress-remove-bg" />
            </div>

          ) : (
            // Source picker (Replace Photo)
            <div className="space-y-3 py-4">
              <p className="text-sm text-muted-foreground text-center mb-2">Choose how to replace the photo</p>
              <Button
                variant="outline"
                className="w-full gap-3 justify-start min-h-12 text-sm"
                onClick={() => { fileInputRef.current?.setAttribute("capture", "environment"); fileInputRef.current?.click(); }}
                data-testid="button-camera"
              >
                <Camera className="h-5 w-5 text-muted-foreground" /> Take a photo
              </Button>
              <Button
                variant="outline"
                className="w-full gap-3 justify-start min-h-12 text-sm"
                onClick={() => { fileInputRef.current?.removeAttribute("capture"); fileInputRef.current?.click(); }}
                data-testid="button-gallery"
              >
                <ImageIcon className="h-5 w-5 text-muted-foreground" /> Choose from gallery
              </Button>
              <Button variant="ghost" className="w-full mt-2" onClick={cancelPhotoEdit} data-testid="button-cancel-photo">
                Cancel
              </Button>
            </div>
          )
        ) : (
          <>
            {/* Photo with swipe navigation */}
            <div
              className="relative rounded-lg overflow-hidden bg-muted select-none"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              data-testid="photo-swipe-area"
            >
              {isReuploading ? (
                <div className="flex items-center justify-center" style={{ minHeight: "50vh" }}>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <img
                  src={viewingOriginal && outfit.originalImageUrl ? outfit.originalImageUrl : outfit.fullImageUrl}
                  alt={`Outfit from ${outfit.dateWorn}${viewingOriginal ? " (original)" : ""}`}
                  onClick={() => setImageFit((m) => (m === "fit" ? "fill" : "fit"))}
                  className={`w-full block cursor-pointer ${imageFit === "fill" ? "h-[80vh] object-cover" : "h-auto"}`}
                  data-testid="outfit-photo"
                />
              )}

              {/* Prev/next side-edge nav buttons. Their click targets start
                  below the top corner zone (top-12) so they don't overlap the
                  History toggle / Original pill that sit at top-2. */}
              {prevId && (
                <button
                  className="absolute left-0 top-12 bottom-0 w-14 flex items-center justify-start pl-1 opacity-0 active:opacity-100 focus:opacity-100"
                  onClick={() => goToOutfit(prevId)}
                  aria-label="Previous outfit"
                  data-testid="button-prev-outfit"
                >
                  <span className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm">
                    <ChevronLeft className="h-5 w-5 text-white" />
                  </span>
                </button>
              )}

              {nextId && (
                <button
                  className="absolute right-0 top-12 bottom-0 w-14 flex items-center justify-end pr-1 opacity-0 active:opacity-100 focus:opacity-100"
                  onClick={() => goToOutfit(nextId)}
                  aria-label="Next outfit"
                  data-testid="button-next-outfit"
                >
                  <span className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm">
                    <ChevronRight className="h-5 w-5 text-white" />
                  </span>
                </button>
              )}

              {/* "Original" indicator pill while viewing the original — the
                  toggle itself now lives in the ⋮ menu (View original photo). */}
              {!isReuploading && outfit.originalImageUrl && viewingOriginal && (
                <span
                  className="absolute top-2 left-2 z-10 pointer-events-none rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[11px] font-medium tracking-wide text-white uppercase"
                  data-testid="badge-original"
                >
                  Original
                </span>
              )}
            </div>

            {positionLabel && (
              <p className="text-xs text-muted-foreground text-center -mt-2" data-testid="text-position">
                {positionLabel}
              </p>
            )}

            {outfit.notes && <p className="text-sm text-muted-foreground">{outfit.notes}</p>}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-foreground">{outfit.items?.length || 0} Items</h3>
                <Button variant="outline" size="sm" className="min-h-7 text-xs gap-1" onClick={() => navigate(`/reconcile/${outfitId}`)} data-testid="button-edit-items">
                  <Tag className="h-3 w-3" /> Tag Items
                </Button>
              </div>

              {outfit.items?.length ? (
                <div className="space-y-0.5">
                  {outfit.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group" data-testid={`item-row-${item.id}`}>
                      <Link
                        href={`/items/${item.id}`}
                        className="flex-1 min-w-0 flex items-center gap-2 py-2 px-1 rounded hover-elevate cursor-pointer"
                        data-testid={`link-item-${item.id}`}
                      >
                        <span className="text-sm font-medium truncate">{item.subCategory || item.category}</span>
                        {(item.color || item.brand) && (
                          <span className="text-xs text-muted-foreground truncate">{[item.color, item.brand].filter(Boolean).join(" / ")}</span>
                        )}
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground flex-shrink-0"
                        onClick={() => removeItemMutation.mutate(item.id)}
                        disabled={removeItemMutation.isPending}
                        data-testid={`button-remove-item-${item.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">No items tagged yet</p>
                  <Button variant="link" size="sm" className="mt-1" onClick={() => navigate(`/reconcile/${outfitId}`)}>Tag items now</Button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this outfit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the outfit from your collection. The individual items will remain in your wardrobe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
