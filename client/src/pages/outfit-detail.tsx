import { useState, useRef, useCallback, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Tag, X, MoreVertical, Trash2, Camera, Image as ImageIcon, ChevronLeft, ChevronRight, Wand2, Upload } from "lucide-react";
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
import { BACKGROUNDS, drawBackground, drawCutoutCentered, removeBgFromBlob, compositeOnBackground, type BgRemovalProgress } from "@/lib/imageUtils";
import { Progress } from "@/components/ui/progress";
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

  const outfitId = params?.id ? parseInt(params.id) : null;

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
  const positionLabel = currentIndex >= 0 && totalCount > 1 ? `${currentIndex + 1} / ${totalCount}` : null;

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
    setIsRemoveBgStep(false);
    setIsRemovingBg(false);
    setBgProgress(null);
    setCutoutBlob(null);
    setIsBgPickerMode(false);
    setIsCompositing(false);
    setIsCurrentPhotoBgFlow(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const uploadBlobAndPatch = useCallback(async (blob: Blob) => {
    setIsReuploading(true);
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

      await apiRequest("PATCH", `/api/outfits/${outfitId}`, { fullImageUrl: objectPath });
      queryClient.invalidateQueries({ queryKey: ["/api/outfits", outfitId] });
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      toast({ title: "Photo updated", description: "Outfit photo has been replaced." });
      resetPhotoEditState();
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Something went wrong", variant: "destructive" });
    } finally {
      setIsReuploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [outfitId, resetPhotoEditState]);

  // File picked via Replace Photo → enter bg removal pipeline
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setSelectedFileBlob(file);
    setSelectedFilePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setCutoutBlob(null);
    setIsRemoveBgStep(true);
    setIsBgPickerMode(false);
  };

  // Run ML model; short-circuits if cutout already computed
  const handleRemoveBg = async () => {
    if (cutoutBlob) {
      setIsRemoveBgStep(false);
      setIsBgPickerMode(true);
      setSelectedBg(0);
      return;
    }
    const source = selectedFileBlob;
    if (!source) return;
    bgRemovalActiveRef.current = true;
    setIsRemovingBg(true);
    setBgProgress(null);
    try {
      const cutout = await removeBgFromBlob(source, (p) => {
        if (bgRemovalActiveRef.current) setBgProgress(p);
      });
      if (!bgRemovalActiveRef.current) return; // user exited the flow
      setCutoutBlob(cutout);
      setIsRemoveBgStep(false);
      setIsBgPickerMode(true);
      setSelectedBg(0);
    } catch {
      if (!bgRemovalActiveRef.current) return; // stale error, flow already reset
      toast({ title: "Background removal failed", description: "Try again or skip to upload as-is", variant: "destructive" });
    } finally {
      setIsRemovingBg(false);
      setBgProgress(null);
    }
  };

  // Skip bg removal → upload the selected file as-is
  const handleSkipBgRemoval = () => {
    if (isCurrentPhotoBgFlow) {
      resetPhotoEditState();
    } else if (selectedFileBlob) {
      uploadBlobAndPatch(selectedFileBlob);
    }
  };

  // Composite cutout onto chosen background and upload immediately
  const handleComposite = async () => {
    if (!cutoutBlob) return;
    setIsCompositing(true);
    try {
      const blob = await compositeOnBackground(cutoutBlob, selectedBg);
      setIsCompositing(false); // switch button to "Uploading..." state
      await uploadBlobAndPatch(blob);
    } catch {
      toast({ title: "Failed to compose image", variant: "destructive" });
      setIsCompositing(false);
    }
  };

  // Remove Background from the current outfit photo (no new image needed)
  const handleRemoveCurrentBg = async () => {
    if (!outfit) return;
    bgRemovalActiveRef.current = true;
    setShowPhotoOptions(true);
    setIsCurrentPhotoBgFlow(true);
    setSelectedFilePreview(outfit.fullImageUrl);
    setIsRemoveBgStep(true);
    setIsRemovingBg(true);
    setBgProgress(null);
    try {
      const res = await fetch(outfit.fullImageUrl);
      if (!bgRemovalActiveRef.current) return; // user exited the flow
      if (!res.ok) throw new Error("Failed to fetch current photo");
      const blob = await res.blob();
      if (!bgRemovalActiveRef.current) return; // user exited the flow
      const cutout = await removeBgFromBlob(blob, (p) => {
        if (bgRemovalActiveRef.current) setBgProgress(p);
      });
      if (!bgRemovalActiveRef.current) return; // user exited the flow
      setCutoutBlob(cutout);
      setIsRemoveBgStep(false);
      setIsBgPickerMode(true);
      setSelectedBg(0);
    } catch {
      if (!bgRemovalActiveRef.current) return; // stale error, flow already reset
      toast({ title: "Background removal failed", description: "Try again", variant: "destructive" });
      resetPhotoEditState();
    } finally {
      setIsRemovingBg(false);
      setBgProgress(null);
    }
  };

  // Back button / cancel logic
  const cancelPhotoEdit = () => {
    if (isBgPickerMode) {
      // From bg picker → back to bg removal choice (cutout preserved to skip re-inference)
      setIsBgPickerMode(false);
      setIsRemoveBgStep(true);
    } else if (isRemoveBgStep && !isCurrentPhotoBgFlow) {
      // From bg removal choice (Replace Photo flow) → back to source picker.
      // Cancel any in-flight ML model run so its result is discarded.
      bgRemovalActiveRef.current = false;
      setIsRemoveBgStep(false);
      setIsRemovingBg(false);
      setSelectedFileBlob(null);
      setSelectedFilePreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setCutoutBlob(null);
    } else {
      resetPhotoEditState();
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/outfits/${outfitId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      toast({ title: "Outfit deleted", description: "The outfit has been removed." });
      if (prevId) navigate(`/outfits/${prevId}`);
      else if (nextId) navigate(`/outfits/${nextId}`);
      else navigate("/");
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
      <div className="min-h-screen bg-background">
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
      <div className="min-h-screen bg-background flex items-center justify-center">
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
  else if (isRemoveBgStep || showPhotoOptions) headerTitle = isCurrentPhotoBgFlow ? "Remove Background" : "Replace Photo";

  return (
    <div className="min-h-screen bg-background">
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
          isBgPickerMode && cutoutBlob ? (
            // Background picker
            <div className="space-y-4">
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
            </div>

          ) : isRemoveBgStep ? (
            // Remove background choice
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <div className="aspect-[3/4] bg-muted">
                  <img
                    src={selectedFilePreview || ""}
                    alt="Your photo"
                    className="w-full h-full object-cover"
                  />
                </div>
              </Card>

              <div className="space-y-2">
                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={handleRemoveBg}
                  disabled={isRemovingBg}
                  data-testid="button-remove-bg"
                >
                  {isRemovingBg
                    ? <><Loader2 className="h-5 w-5 animate-spin" /> {bgProgress ? (bgProgress.phase === "download" ? `Downloading model... ${bgProgress.percent}%` : `Processing... ${bgProgress.percent}%`) : "Removing background..."}</>
                    : <><Wand2 className="h-5 w-5" /> Remove Background</>}
                </Button>
                {isRemovingBg && (
                  <>
                    <Progress
                      value={bgProgress?.percent ?? 0}
                      className="h-1.5"
                      data-testid="progress-remove-bg"
                    />
                    <p className="text-xs text-center text-muted-foreground">
                      {bgProgress?.phase === "download"
                        ? "Downloading the background-removal model (one-time)"
                        : bgProgress?.phase === "process"
                        ? "Processing your photo"
                        : "First time may take a moment while the model loads"}
                    </p>
                  </>
                )}
                {!isCurrentPhotoBgFlow && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    size="lg"
                    onClick={handleSkipBgRemoval}
                    disabled={isRemovingBg || isReuploading}
                    data-testid="button-skip-bg-removal"
                  >
                    {isReuploading ? <><Loader2 className="h-5 w-5 animate-spin" /> Uploading...</> : "Skip — upload as-is"}
                  </Button>
                )}
              </div>
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
              <div className="aspect-[3/4]">
                {isReuploading ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <img
                    src={outfit.fullImageUrl}
                    alt={`Outfit from ${outfit.dateWorn}`}
                    className="w-full h-full object-cover"
                    data-testid="outfit-photo"
                  />
                )}
              </div>

              {prevId && (
                <button
                  className="absolute left-0 top-0 h-full w-14 flex items-center justify-start pl-1 opacity-0 active:opacity-100 focus:opacity-100"
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
                  className="absolute right-0 top-0 h-full w-14 flex items-center justify-end pr-1 opacity-0 active:opacity-100 focus:opacity-100"
                  onClick={() => goToOutfit(nextId)}
                  aria-label="Next outfit"
                  data-testid="button-next-outfit"
                >
                  <span className="bg-black/40 rounded-full p-1.5 backdrop-blur-sm">
                    <ChevronRight className="h-5 w-5 text-white" />
                  </span>
                </button>
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
