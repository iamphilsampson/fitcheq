import { useState, useRef, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Tag, X, MoreVertical, Trash2, Camera, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { Outfit, Item } from "@shared/schema";

interface OutfitWithItems extends Outfit {
  items: Item[];
}

export default function OutfitDetail() {
  const [, params] = useRoute("/outfits/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isReuploading, setIsReuploading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);

  const outfitId = params?.id ? parseInt(params.id) : null;

  const { data: outfit, isLoading } = useQuery<OutfitWithItems>({
    queryKey: ["/api/outfits", outfitId],
    enabled: !!outfitId,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/outfits/${outfitId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      toast({ title: "Outfit deleted", description: "The outfit has been removed." });
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
      setShowPhotoOptions(false);
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Something went wrong", variant: "destructive" });
    } finally {
      setIsReuploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [outfitId]);

  const handleReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setShowPhotoOptions(false);
    await uploadBlobAndPatch(file);
  };

  const cancelPhotoEdit = () => {
    setShowPhotoOptions(false);
  };

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

  return (
    <div className="min-h-screen bg-background">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReupload} data-testid="input-reupload" />

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
              {isEditingPhoto ? "Change Photo" : formattedDate}
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
                  <DropdownMenuItem onClick={() => setShowPhotoOptions(true)} disabled={isReuploading} data-testid="menu-change-photo">
                    <Camera className="h-4 w-4" /> Change Photo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive" data-testid="menu-delete">
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
        ) : (
          <>
            <div className="rounded-lg overflow-hidden bg-muted">
              <div className="aspect-[3/4]">
                {isReuploading ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <img src={outfit.fullImageUrl} alt={`Outfit from ${outfit.dateWorn}`} className="w-full h-full object-cover" />
                )}
              </div>
            </div>

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
