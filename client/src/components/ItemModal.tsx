import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, Loader2, Check, X, Pencil, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import type { Item, Outfit } from "@shared/schema";

interface ItemWithOutfits extends Item {
  outfits: Outfit[];
}

/**
 * Item detail as a centered modal over the wardrobe (replaces the old full page).
 * Opens when the route is /items/:id; closing navigates back to the wardrobe.
 * The wardrobe stays mounted underneath, so its scroll + expand state are kept.
 */
export function ItemModal({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    subCategory: "",
    color: "",
    brand: "",
    size: "",
    description: "",
  });

  const { data: item, isLoading } = useQuery<ItemWithOutfits>({
    queryKey: ["/api/items", itemId],
    enabled: !!itemId,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to delete",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Item>) => {
      return await apiRequest("PATCH", `/api/items/${itemId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Item updated" });
      setIsEditing(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to update",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const startEditing = () => {
    if (!item) return;
    setEditForm({
      subCategory: item.subCategory || "",
      color: item.color || "",
      brand: item.brand || "",
      size: item.size || "",
      description: item.description || "",
    });
    setIsEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      subCategory: editForm.subCategory || null,
      color: editForm.color || null,
      brand: editForm.brand || null,
      size: editForm.size || null,
      description: editForm.description || null,
    } as Partial<Item>);
  };

  const outfitCount = item?.outfits?.length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-[calc(100vw-2rem)] sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isLoading || !item ? (
          <div className="space-y-4 py-2">
            <DialogTitle className="sr-only">Item</DialogTitle>
            <DialogDescription className="sr-only">Loading item details</DialogDescription>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 pr-8">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl font-bold tracking-tight truncate">
                  {item.subCategory || item.category}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {[item.brand, item.color, item.size ? `Size ${item.size}` : null]
                    .filter(Boolean)
                    .join(" · ") || item.category}
                </DialogDescription>
              </div>
              {!isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="-mt-1" data-testid="button-item-menu">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={startEditing} data-testid="menu-item-edit">
                      <Pencil className="h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                      data-testid="menu-item-delete"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                  <Input
                    value={editForm.subCategory}
                    onChange={(e) => setEditForm((f) => ({ ...f, subCategory: e.target.value }))}
                    placeholder="e.g. T-Shirt, Jeans"
                    className="text-sm"
                    data-testid="input-edit-subcategory"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Colour</label>
                    <Input
                      value={editForm.color}
                      onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                      placeholder="e.g. Black"
                      className="text-sm"
                      data-testid="input-edit-color"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Brand</label>
                    <Input
                      value={editForm.brand}
                      onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))}
                      placeholder="e.g. Nike"
                      className="text-sm"
                      data-testid="input-edit-brand"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Size</label>
                  <Input
                    value={editForm.size}
                    onChange={(e) => setEditForm((f) => ({ ...f, size: e.target.value }))}
                    placeholder="e.g. M, 32, 10"
                    className="text-sm"
                    data-testid="input-edit-size"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                    Cancel
                  </Button>
                  <Button size="sm" className="gap-1" onClick={saveEdit} disabled={updateMutation.isPending} data-testid="button-save-edit">
                    {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Worn in {outfitCount} outfit{outfitCount !== 1 ? "s" : ""}
                </p>
                {outfitCount > 0 ? (
                  <div className="flex gap-2.5 overflow-x-auto -mx-6 px-6 scroll-px-6 pb-1 snap-x snap-mandatory">
                    {item.outfits.map((outfit) => (
                      <button
                        key={outfit.id}
                        onClick={() => navigate(`/outfits/${outfit.id}`)}
                        className="snap-start flex-shrink-0 w-[42%] text-left hover-elevate rounded-xl"
                        data-testid={`modal-outfit-${outfit.id}`}
                      >
                        <div className="aspect-[3/4] bg-muted rounded-xl overflow-hidden">
                          <img
                            src={outfit.fullImageUrl}
                            alt={`Outfit from ${outfit.dateWorn}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {new Date(outfit.dateWorn).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">No outfits with this item yet</p>
                )}
              </div>
            )}
          </>
        )}

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this item?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the item from your wardrobe. It will be unlinked from any
                outfits, but the outfit photos remain.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-destructive text-destructive-foreground"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
