import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, ChevronDown, Loader2, Shirt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Item, DetectedItem, Outfit } from "@shared/schema";

interface ReconcileItem {
  detected: DetectedItem;
  selectedItemId: number | null;
  isNew: boolean;
  newItemData?: {
    brand: string;
    size: string;
  };
}

export default function Reconcile() {
  const [, params] = useRoute("/reconcile/:outfitId");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const outfitId = params?.outfitId ? parseInt(params.outfitId) : null;
  const searchParams = new URLSearchParams(window.location.search);
  const detectedItemsParam = searchParams.get("items");

  const [reconcileItems, setReconcileItems] = useState<ReconcileItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const { data: outfit, isLoading: outfitLoading } = useQuery<Outfit>({
    queryKey: ["/api/outfits", outfitId],
    enabled: !!outfitId,
  });

  const { data: existingItems } = useQuery<Item[]>({
    queryKey: ["/api/items"],
  });

  useEffect(() => {
    if (detectedItemsParam) {
      try {
        const detected: DetectedItem[] = JSON.parse(decodeURIComponent(detectedItemsParam));
        setReconcileItems(
          detected.map((item) => ({
            detected: item,
            selectedItemId: null,
            isNew: true,
            newItemData: { brand: "", size: "" },
          }))
        );
      } catch (e) {
        console.error("Failed to parse detected items:", e);
      }
    }
  }, [detectedItemsParam]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const itemIds: number[] = [];

      for (const reconcileItem of reconcileItems) {
        if (reconcileItem.selectedItemId) {
          itemIds.push(reconcileItem.selectedItemId);
        } else if (reconcileItem.isNew) {
          const response = await apiRequest("POST", "/api/items", {
            category: reconcileItem.detected.category,
            subCategory: reconcileItem.detected.subCategory,
            color: reconcileItem.detected.color,
            description: reconcileItem.detected.description,
            brand: reconcileItem.newItemData?.brand || null,
            size: reconcileItem.newItemData?.size || null,
          });
          const newItem = response as Item;
          itemIds.push(newItem.id);
        }
      }

      await apiRequest("POST", `/api/outfits/${outfitId}/items`, { itemIds });

      return itemIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      toast({
        title: "Outfit saved!",
        description: "Your outfit and items have been saved to your wardrobe.",
      });
      navigate("/");
    },
    onError: (error) => {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleSelectExisting = (index: number, itemId: number) => {
    setReconcileItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selectedItemId: itemId, isNew: false } : item
      )
    );
  };

  const handleCreateNew = (index: number) => {
    setReconcileItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selectedItemId: null, isNew: true } : item
      )
    );
    setEditingIndex(index);
  };

  const handleUpdateNewItem = (index: number, field: "brand" | "size", value: string) => {
    setReconcileItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              newItemData: { ...item.newItemData!, [field]: value },
            }
          : item
      )
    );
  };

  const getMatchingItems = (detected: DetectedItem): Item[] => {
    if (!existingItems) return [];
    return existingItems.filter(
      (item) =>
        item.category.toLowerCase() === detected.category.toLowerCase() ||
        item.color?.toLowerCase() === detected.color.toLowerCase()
    );
  };

  if (outfitLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">Match Items</h1>
            <p className="text-xs text-muted-foreground">
              {reconcileItems.length} items detected
            </p>
          </div>
        </div>
      </header>

      <main className="p-4 pb-24 space-y-4">
        {outfit && (
          <Card className="overflow-hidden">
            <div className="aspect-[16/9] bg-muted">
              <img
                src={outfit.fullImageUrl}
                alt="Outfit"
                className="w-full h-full object-cover"
              />
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {reconcileItems.map((reconcileItem, index) => {
            const matchingItems = getMatchingItems(reconcileItem.detected);
            const selectedItem = existingItems?.find(
              (item) => item.id === reconcileItem.selectedItemId
            );

            return (
              <Card key={index} className="p-4" data-testid={`card-reconcile-${index}`}>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <Shirt className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {reconcileItem.detected.subCategory || reconcileItem.detected.category}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {reconcileItem.detected.color}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {reconcileItem.detected.description}
                    </p>

                    <div className="mt-3 space-y-2">
                      {reconcileItem.isNew && !reconcileItem.selectedItemId ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-primary/5 text-primary">
                            <Plus className="h-3 w-3 mr-1" />
                            New Item
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingIndex(index)}
                            data-testid={`button-edit-${index}`}
                          >
                            Add details
                          </Button>
                        </div>
                      ) : selectedItem ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            <Check className="h-3 w-3 mr-1" />
                            {selectedItem.brand || selectedItem.subCategory}
                          </Badge>
                        </div>
                      ) : null}

                      {matchingItems.length > 0 && (
                        <Select
                          value={reconcileItem.selectedItemId?.toString() || "new"}
                          onValueChange={(value) => {
                            if (value === "new") {
                              handleCreateNew(index);
                            } else {
                              handleSelectExisting(index, parseInt(value));
                            }
                          }}
                        >
                          <SelectTrigger
                            className="w-full"
                            data-testid={`select-item-${index}`}
                          >
                            <SelectValue placeholder="Select or create item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">
                              <span className="flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                Create new item
                              </span>
                            </SelectItem>
                            {matchingItems.map((item) => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                <span className="flex items-center gap-2">
                                  {item.brand && (
                                    <span className="font-medium">{item.brand}</span>
                                  )}
                                  {item.subCategory || item.category}
                                  {item.color && (
                                    <span className="text-muted-foreground">
                                      ({item.color})
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t">
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-5 w-5" />
              Save Outfit
            </>
          )}
        </Button>
      </div>

      <Dialog open={editingIndex !== null} onOpenChange={() => setEditingIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Item Details</DialogTitle>
          </DialogHeader>
          {editingIndex !== null && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium text-sm">
                  {reconcileItems[editingIndex]?.detected.subCategory ||
                    reconcileItems[editingIndex]?.detected.category}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {reconcileItems[editingIndex]?.detected.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand (optional)</Label>
                <Input
                  id="brand"
                  placeholder="e.g., Nike, Zara, Uniqlo"
                  value={reconcileItems[editingIndex]?.newItemData?.brand || ""}
                  onChange={(e) =>
                    handleUpdateNewItem(editingIndex, "brand", e.target.value)
                  }
                  data-testid="input-brand"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="size">Size (optional)</Label>
                <Input
                  id="size"
                  placeholder="e.g., M, 32, 10.5"
                  value={reconcileItems[editingIndex]?.newItemData?.size || ""}
                  onChange={(e) =>
                    handleUpdateNewItem(editingIndex, "size", e.target.value)
                  }
                  data-testid="input-size"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setEditingIndex(null)} data-testid="button-done">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
