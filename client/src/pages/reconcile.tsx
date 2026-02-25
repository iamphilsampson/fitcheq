import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, Loader2, Shirt, X, Tag } from "lucide-react";
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

const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Footwear", "Accessories"];
const SUB_CATEGORIES: Record<string, string[]> = {
  Tops: ["T-Shirt", "Shirt", "Blouse", "Polo", "Tank Top", "Sweater", "Hoodie", "Crop Top"],
  Bottoms: ["Jeans", "Trousers", "Shorts", "Skirt", "Joggers", "Leggings", "Chinos"],
  Outerwear: ["Jacket", "Coat", "Blazer", "Vest", "Cardigan", "Windbreaker", "Puffer"],
  Footwear: ["Sneakers", "Boots", "Sandals", "Loafers", "Heels", "Flats", "Slides"],
  Accessories: ["Watch", "Hat", "Bag", "Belt", "Sunglasses", "Jewelry", "Scarf"],
};

interface TagItem {
  detected: DetectedItem;
  selectedItemId: number | null;
  isNew: boolean;
  newItemData?: { brand: string; size: string };
}

export default function Reconcile() {
  const [, params] = useRoute("/reconcile/:outfitId");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const outfitId = params?.outfitId ? parseInt(params.outfitId) : null;
  const searchParams = new URLSearchParams(window.location.search);
  const detectedItemsParam = searchParams.get("items");

  const [tagItems, setTagItems] = useState<TagItem[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newCategory, setNewCategory] = useState("Tops");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showExistingPicker, setShowExistingPicker] = useState(false);

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
        setTagItems(
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

      for (const tagItem of tagItems) {
        if (tagItem.selectedItemId) {
          itemIds.push(tagItem.selectedItemId);
        } else if (tagItem.isNew) {
          const response = await apiRequest("POST", "/api/items", {
            category: tagItem.detected.category,
            subCategory: tagItem.detected.subCategory,
            color: tagItem.detected.color,
            description: tagItem.detected.description,
            brand: tagItem.newItemData?.brand || null,
            size: tagItem.newItemData?.size || null,
          });
          const newItem = response as Item;
          itemIds.push(newItem.id);
        }
      }

      if (itemIds.length > 0) {
        await apiRequest("POST", `/api/outfits/${outfitId}/items`, { itemIds });
      }

      return itemIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      toast({
        title: "Outfit saved!",
        description: tagItems.length > 0
          ? "Your outfit and items have been saved."
          : "Outfit saved. You can tag items later.",
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

  const handleAddNewItem = () => {
    if (!newCategory) return;
    const newItem: TagItem = {
      detected: {
        category: newCategory,
        subCategory: newSubCategory || newCategory,
        color: newColor,
        description: newDescription || `${newColor} ${newSubCategory || newCategory}`.trim(),
      },
      selectedItemId: null,
      isNew: true,
      newItemData: { brand: "", size: "" },
    };
    setTagItems((prev) => [...prev, newItem]);
    setShowAddDialog(false);
    setNewCategory("Tops");
    setNewSubCategory("");
    setNewColor("");
    setNewDescription("");
  };

  const handleAddExisting = (item: Item) => {
    const existingTag: TagItem = {
      detected: {
        category: item.category,
        subCategory: item.subCategory || item.category,
        color: item.color || "",
        description: item.description || "",
      },
      selectedItemId: item.id,
      isNew: false,
    };
    setTagItems((prev) => [...prev, existingTag]);
    setShowExistingPicker(false);
  };

  const handleRemoveItem = (index: number) => {
    setTagItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateNewItem = (index: number, field: "brand" | "size", value: string) => {
    setTagItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, newItemData: { ...item.newItemData!, [field]: value } }
          : item
      )
    );
  };

  const alreadyLinkedIds = new Set(tagItems.filter((t) => t.selectedItemId).map((t) => t.selectedItemId));
  const availableExistingItems = existingItems?.filter((item) => !alreadyLinkedIds.has(item.id)) || [];

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
          <div className="flex-1">
            <h1 className="text-base font-semibold text-foreground">Tag Items</h1>
            <p className="text-xs text-muted-foreground">
              {tagItems.length} item{tagItems.length !== 1 ? "s" : ""} tagged
            </p>
          </div>
        </div>
      </header>

      <main className="p-4 pb-28 space-y-4">
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

        {tagItems.length === 0 && !detectedItemsParam && (
          <div className="py-6 text-center">
            <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No items tagged yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Tag the clothing items in this outfit
            </p>
          </div>
        )}

        <div className="space-y-3">
          {tagItems.map((tagItem, index) => {
            const selectedItem = existingItems?.find(
              (item) => item.id === tagItem.selectedItemId
            );

            return (
              <Card key={index} className="p-3" data-testid={`card-tag-${index}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    {selectedItem?.imageUrl ? (
                      <img src={selectedItem.imageUrl} alt="" className="w-full h-full object-cover rounded-md" />
                    ) : (
                      <Shirt className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {tagItem.detected.subCategory || tagItem.detected.category}
                      </span>
                      {tagItem.detected.color && (
                        <Badge variant="secondary" className="text-xs">
                          {tagItem.detected.color}
                        </Badge>
                      )}
                      {tagItem.isNew ? (
                        <Badge variant="outline" className="text-xs bg-primary/5 text-primary">
                          New
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Existing
                        </Badge>
                      )}
                    </div>
                    {tagItem.detected.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {tagItem.detected.description}
                      </p>
                    )}
                    {tagItem.isNew && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 text-xs px-2"
                        onClick={() => setEditingIndex(index)}
                        data-testid={`button-edit-${index}`}
                      >
                        Add brand/size
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => handleRemoveItem(index)}
                    data-testid={`button-remove-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => setShowAddDialog(true)}
            data-testid="button-add-new-item"
          >
            <Plus className="h-4 w-4" />
            New Item
          </Button>
          {availableExistingItems.length > 0 && (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => setShowExistingPicker(true)}
              data-testid="button-add-existing-item"
            >
              <Shirt className="h-4 w-4" />
              From Wardrobe
            </Button>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t">
        <div className="max-w-md mx-auto">
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
                {tagItems.length > 0 ? "Save Outfit" : "Save Without Items"}
              </>
            )}
          </Button>
        </div>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Category</Label>
              <Select value={newCategory} onValueChange={(v) => { setNewCategory(v); setNewSubCategory(""); }}>
                <SelectTrigger data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Type</Label>
              <Select value={newSubCategory} onValueChange={setNewSubCategory}>
                <SelectTrigger data-testid="select-subcategory">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {(SUB_CATEGORIES[newCategory] || []).map((sub) => (
                    <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Color</Label>
              <Input
                placeholder="e.g., Black, Navy, Red"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                data-testid="input-color"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Description (optional)</Label>
              <Input
                placeholder="e.g., Striped cotton crew neck"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                data-testid="input-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddNewItem} disabled={!newCategory} data-testid="button-confirm-add">
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExistingPicker} onOpenChange={setShowExistingPicker}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select from Wardrobe</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2">
            {availableExistingItems.map((item) => (
              <Card
                key={item.id}
                className="p-3 cursor-pointer hover-elevate"
                onClick={() => handleAddExisting(item)}
                data-testid={`select-existing-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover rounded-md" />
                    ) : (
                      <Shirt className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.subCategory || item.category}
                    </p>
                    <div className="flex gap-1.5 mt-0.5">
                      {item.brand && (
                        <span className="text-xs text-muted-foreground">{item.brand}</span>
                      )}
                      {item.color && (
                        <Badge variant="secondary" className="text-xs h-4 px-1.5">{item.color}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {availableExistingItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No items available to add
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingIndex !== null} onOpenChange={() => setEditingIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Details</DialogTitle>
          </DialogHeader>
          {editingIndex !== null && (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium text-sm">
                  {tagItems[editingIndex]?.detected.subCategory ||
                    tagItems[editingIndex]?.detected.category}
                </p>
                {tagItems[editingIndex]?.detected.color && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tagItems[editingIndex]?.detected.color}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Brand (optional)</Label>
                <Input
                  placeholder="e.g., Nike, Zara, Uniqlo"
                  value={tagItems[editingIndex]?.newItemData?.brand || ""}
                  onChange={(e) =>
                    handleUpdateNewItem(editingIndex, "brand", e.target.value)
                  }
                  data-testid="input-brand"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Size (optional)</Label>
                <Input
                  placeholder="e.g., M, 32, 10.5"
                  value={tagItems[editingIndex]?.newItemData?.size || ""}
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
