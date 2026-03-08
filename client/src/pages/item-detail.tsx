import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Trash2, Loader2, Check, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Item, Outfit } from "@shared/schema";

interface ItemWithOutfits extends Item {
  outfits: Outfit[];
}

export default function ItemDetail() {
  const [, params] = useRoute("/items/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    subCategory: "",
    color: "",
    brand: "",
    size: "",
    description: "",
  });

  const itemId = params?.id ? parseInt(params.id) : null;

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
      toast({
        title: "Item deleted",
        description: "The item has been removed from your wardrobe.",
      });
      navigate("/");
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
          <div className="px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Skeleton className="h-6 w-32" />
          </div>
        </header>
        <main className="p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-32" />
        </main>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-semibold">Item not found</h2>
          <Button variant="link" onClick={() => navigate("/")}>
            Go back home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold text-foreground truncate">
              {item.subCategory || item.category}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditing(false)}
                  data-testid="button-cancel-edit"
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={saveEdit}
                  disabled={updateMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={startEditing}
                  data-testid="button-edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      data-testid="button-delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the item from your wardrobe. The item will be
                        unlinked from any outfits but the outfit photos will remain.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-destructive text-destructive-foreground"
                        data-testid="button-confirm-delete"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Delete"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="p-4 space-y-5">
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
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Any notes about this item"
                className="text-sm"
                data-testid="input-edit-description"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {[item.color, item.brand, item.subCategory || item.category].filter(Boolean).join(" ")}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{item.category}</Badge>
              {item.subCategory && item.subCategory !== item.category && (
                <Badge variant="secondary">{item.subCategory}</Badge>
              )}
              {item.color && (
                <Badge variant="outline" className="gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full border"
                    style={{ backgroundColor: item.color.toLowerCase() }}
                  />
                  {item.color}
                </Badge>
              )}
              {item.brand && <Badge variant="outline">{item.brand}</Badge>}
              {item.size && <Badge variant="outline">Size: {item.size}</Badge>}
            </div>
            {item.description && (
              <p className="text-sm text-muted-foreground">{item.description}</p>
            )}
          </div>
        )}

        <div>
          <h3 className="font-semibold text-foreground mb-3">
            Worn in {item.outfits?.length || 0} outfit{(item.outfits?.length || 0) !== 1 ? "s" : ""}
          </h3>

          {item.outfits?.length ? (
            <div className="grid grid-cols-3 gap-2">
              {item.outfits.map((outfit) => (
                <Card
                  key={outfit.id}
                  className="overflow-hidden hover-elevate cursor-pointer"
                  onClick={() => navigate(`/outfits/${outfit.id}`)}
                  data-testid={`card-outfit-${outfit.id}`}
                >
                  <div className="aspect-[3/4] bg-muted">
                    <img
                      src={outfit.fullImageUrl}
                      alt={`Outfit from ${outfit.dateWorn}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-1.5">
                    <p className="text-xs text-muted-foreground">
                      {new Date(outfit.dateWorn).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No outfits with this item yet
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
