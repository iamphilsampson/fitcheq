import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, Loader2, Shirt, X, ChevronDown, ChevronUp, Footprints, Watch, CloudSun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Item, DetectedItem, Outfit } from "@shared/schema";

const SLOT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Tops: Shirt,
  Outerwear: CloudSun,
  Bottoms: Shirt,
  Footwear: Footprints,
  Accessories: Watch,
};

function SlotIcon({ category, className }: { category: string; className?: string }) {
  const Icon = SLOT_ICONS[category] || Shirt;
  return <Icon className={className} />;
}

const PRESETS = {
  male: {
    slots: [
      {
        category: "Tops",
        label: "Top",
        required: true,
        subCategories: ["T-Shirt", "Long Sleeve", "Shirt (Short)", "Shirt (Long)", "Vest", "Jumper", "Hoodie"],
      },
      {
        category: "Outerwear",
        label: "Layer",
        required: false,
        subCategories: ["Coat", "Overshirt", "Windbreaker"],
      },
      {
        category: "Bottoms",
        label: "Bottoms",
        required: true,
        subCategories: ["Jeans", "Trousers", "Shorts"],
      },
      {
        category: "Footwear",
        label: "Shoes",
        required: true,
        subCategories: ["Wallabee", "Trainers"],
      },
      {
        category: "Accessories",
        label: "Accessories",
        required: false,
        subCategories: ["Hat", "Bag", "Belt", "Sunnies"],
      },
    ],
  },
  female: {
    slots: [
      {
        category: "Tops",
        label: "Top",
        required: true,
        subCategories: ["T-Shirt", "Blouse", "Crop Top", "Tank Top", "Sweater", "Hoodie", "Cami"],
      },
      {
        category: "Outerwear",
        label: "Layer",
        required: false,
        subCategories: ["Jacket", "Coat", "Blazer", "Cardigan", "Trench"],
      },
      {
        category: "Bottoms",
        label: "Bottoms",
        required: true,
        subCategories: ["Jeans", "Trousers", "Skirt", "Shorts", "Leggings"],
      },
      {
        category: "Footwear",
        label: "Shoes",
        required: true,
        subCategories: ["Sneakers", "Boots", "Heels", "Sandals", "Flats", "Loafers"],
      },
      {
        category: "Accessories",
        label: "Accessories",
        required: false,
        subCategories: ["Bag", "Belt", "Sunglasses", "Jewelry", "Scarf", "Hat"],
      },
    ],
  },
};

interface SlotState {
  id: string;
  category: string;
  label: string;
  required: boolean;
  subCategories: string[];
  selectedSubCategory: string | null;
  colorBrand: string;
  existingItemId: number | null;
  skipped: boolean;
}

function parseColorBrand(input: string): { color: string; brand: string } {
  const parts = input.split("/").map((s) => s.trim());
  return { color: parts[0] || "", brand: parts[1] || "" };
}

function getPreset(): "male" | "female" {
  return (localStorage.getItem("fitcheck-preset") as "male" | "female") || "male";
}

let slotCounter = 0;
function makeSlotId() {
  return `slot-${++slotCounter}`;
}

function buildInitialSlots(preset: "male" | "female"): SlotState[] {
  return PRESETS[preset].slots.map((s) => ({
    id: makeSlotId(),
    category: s.category,
    label: s.label,
    required: s.required,
    subCategories: s.subCategories,
    selectedSubCategory: null,
    colorBrand: "",
    existingItemId: null,
    skipped: false,
  }));
}

export default function Reconcile() {
  const [, params] = useRoute("/reconcile/:outfitId");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const outfitId = params?.outfitId ? parseInt(params.outfitId) : null;
  const searchParams = new URLSearchParams(window.location.search);
  const detectedItemsParam = searchParams.get("items");

  const preset = getPreset();
  const [initialSlots] = useState<SlotState[]>(() => buildInitialSlots(preset));
  const [slots, setSlots] = useState<SlotState[]>(initialSlots);
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(
    () => new Set(initialSlots.filter((s) => s.required).map((s) => s.id))
  );

  const toggleExpanded = (slotId: string) => {
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

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
        setSlots((prev) => {
          const updated = [...prev];
          for (const d of detected) {
            const slotIdx = updated.findIndex(
              (s) => s.category.toLowerCase() === d.category.toLowerCase() && !s.selectedSubCategory && !s.existingItemId
            );
            if (slotIdx >= 0) {
              updated[slotIdx] = {
                ...updated[slotIdx],
                selectedSubCategory: d.subCategory,
                colorBrand: d.color,
              };
            }
          }
          return updated;
        });
      } catch (e) {
        console.error("Failed to parse detected items:", e);
      }
    }
  }, [detectedItemsParam]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const itemIds: number[] = [];

      for (const slot of slots) {
        if (slot.skipped) continue;
        if (slot.existingItemId) {
          itemIds.push(slot.existingItemId);
        } else if (slot.selectedSubCategory) {
          const { color, brand } = parseColorBrand(slot.colorBrand);
          const desc = `${color} ${slot.selectedSubCategory}`.trim();
          const response = await apiRequest("POST", "/api/items", {
            category: slot.category,
            subCategory: slot.selectedSubCategory,
            color: color || null,
            brand: brand || null,
            description: desc || null,
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
      toast({ title: "Outfit saved!", description: "Items tagged to your outfit." });
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

  const selectSubCategory = (slotId: string, sub: string) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, selectedSubCategory: s.selectedSubCategory === sub ? null : sub, existingItemId: null, skipped: false }
          : s
      )
    );
  };

  const selectExistingItem = (slotId: string, item: Item) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, existingItemId: item.id, selectedSubCategory: item.subCategory || item.category, colorBrand: [item.color, item.brand].filter(Boolean).join(" / "), skipped: false }
          : s
      )
    );
  };

  const updateColorBrand = (slotId: string, colorBrand: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, colorBrand } : s))
    );
  };

  const skipSlot = (slotId: string) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, skipped: true, selectedSubCategory: null, existingItemId: null, colorBrand: "" }
          : s
      )
    );
  };

  const unskipSlot = (slotId: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, skipped: false } : s))
    );
  };

  const clearSlot = (slotId: string) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, selectedSubCategory: null, existingItemId: null, colorBrand: "", skipped: false } : s
      )
    );
  };

  const addExtraSlot = () => {
    const presetSlots = PRESETS[preset].slots;
    const newSlot: SlotState = {
      id: makeSlotId(),
      category: presetSlots[0].category,
      label: presetSlots[0].label,
      required: false,
      subCategories: presetSlots[0].subCategories,
      selectedSubCategory: null,
      colorBrand: "",
      existingItemId: null,
      skipped: false,
    };
    setSlots((prev) => [...prev, newSlot]);
  };

  const changeExtraSlotCategory = (slotId: string, category: string) => {
    const presetSlot = PRESETS[preset].slots.find((s) => s.category === category);
    if (!presetSlot) return;
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              category: presetSlot.category,
              label: presetSlot.label,
              subCategories: presetSlot.subCategories,
              selectedSubCategory: null,
              existingItemId: null,
              colorBrand: "",
            }
          : s
      )
    );
  };

  const removeExtraSlot = (slotId: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
  };

  const getMatchingItems = (category: string, subCategory?: string | null): Item[] => {
    if (!existingItems) return [];
    const usedIds = new Set(slots.filter((s) => s.existingItemId).map((s) => s.existingItemId));
    return existingItems.filter((item) => {
      if (usedIds.has(item.id)) return false;
      if (item.category.toLowerCase() !== category.toLowerCase()) return false;
      if (subCategory && item.subCategory && item.subCategory.toLowerCase() !== subCategory.toLowerCase()) return false;
      return true;
    });
  };

  const filledCount = slots.filter((s) => !s.skipped && (s.selectedSubCategory || s.existingItemId)).length;
  const initialSlotCount = PRESETS[preset].slots.length;

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
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-foreground">Tag Items</h1>
            <p className="text-xs text-muted-foreground">
              {filledCount} item{filledCount !== 1 ? "s" : ""} tagged
            </p>
          </div>
        </div>
      </header>

      <main className="p-4 pb-28 space-y-3">
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

        {slots.map((slot, index) => {
          const isExpanded = expandedSlots.has(slot.id);
          const isFilled = !!(slot.selectedSubCategory || slot.existingItemId);
          const isExtra = index >= initialSlotCount;
          const selectedExisting = existingItems?.find((i) => i.id === slot.existingItemId);

          if (slot.skipped) {
            return (
              <Card
                key={slot.id}
                className="p-3 opacity-50 cursor-pointer"
                onClick={() => unskipSlot(slot.id)}
                data-testid={`card-slot-${index}`}
              >
                <div className="flex items-center gap-3">
                  <SlotIcon category={slot.category} className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground line-through">{slot.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">tap to add</span>
                </div>
              </Card>
            );
          }

          return (
            <Card key={slot.id} className="p-3" data-testid={`card-slot-${index}`}>
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => toggleExpanded(slot.id)}
              >
                <SlotIcon category={slot.category} className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{slot.label}</span>
                    {isFilled && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedExisting ? (
                          <>{selectedExisting.color ? `${selectedExisting.color} ` : ""}{selectedExisting.brand ? `${selectedExisting.brand} ` : ""}{slot.selectedSubCategory}</>
                        ) : (
                          <>{slot.colorBrand ? `${slot.colorBrand} ` : ""}{slot.selectedSubCategory}</>
                        )}
                      </Badge>
                    )}
                    {isFilled && selectedExisting && (
                      <Badge variant="outline" className="text-xs">Existing</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isFilled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); clearSlot(slot.id); }}
                      data-testid={`button-clear-${index}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {!slot.required && !isExtra && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); skipSlot(slot.id); }}
                      data-testid={`button-skip-${index}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isExtra && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); removeExtraSlot(slot.id); }}
                      data-testid={`button-remove-extra-${index}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {isExtra && (
                    <div className="flex gap-1.5 flex-wrap">
                      {PRESETS[preset].slots.map((ps) => (
                        <button
                          key={ps.category}
                          className={`relative px-2.5 py-1 rounded-full text-xs font-medium ${
                            slot.category === ps.category
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover-elevate"
                          }`}
                          onClick={() => changeExtraSlotCategory(slot.id, ps.category)}
                          data-testid={`chip-category-${ps.category}-${index}`}
                        >
                          {ps.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Select type</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {slot.subCategories.map((sub) => (
                        <button
                          key={sub}
                          className={`relative px-2.5 py-1.5 rounded-full text-xs font-medium ${
                            slot.selectedSubCategory === sub && !slot.existingItemId
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground hover-elevate"
                          }`}
                          onClick={() => selectSubCategory(slot.id, sub)}
                          data-testid={`chip-${sub.replace(/\s+/g, "-").toLowerCase()}-${index}`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  </div>

                  {slot.selectedSubCategory && !slot.existingItemId && (() => {
                    const matchingItems = getMatchingItems(slot.category, slot.selectedSubCategory);
                    return (
                      <>
                        {matchingItems.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1.5">From your wardrobe</p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {matchingItems.map((item) => (
                                <button
                                  key={item.id}
                                  className={`relative flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-left ${
                                    slot.existingItemId === item.id
                                      ? "border-primary bg-primary/5"
                                      : "border-border hover-elevate"
                                  }`}
                                  onClick={() => selectExistingItem(slot.id, item)}
                                  data-testid={`existing-${item.id}-slot-${index}`}
                                >
                                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                    {item.imageUrl ? (
                                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover rounded" />
                                    ) : (
                                      <Shirt className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate max-w-[80px]">
                                      {item.subCategory || item.category}
                                    </p>
                                    {(item.brand || item.color) && (
                                      <p className="text-xs text-muted-foreground truncate max-w-[80px]">
                                        {[item.color, item.brand].filter(Boolean).join(" / ")}
                                      </p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <Input
                            placeholder="Colour / Brand (e.g. Black / Nike)"
                            value={slot.colorBrand}
                            onChange={(e) => updateColorBrand(slot.id, e.target.value)}
                            className="text-sm"
                            data-testid={`input-color-brand-${index}`}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </Card>
          );
        })}

        <Button
          variant="ghost"
          className="w-full gap-2 text-muted-foreground"
          onClick={addExtraSlot}
          data-testid="button-add-slot"
        >
          <Plus className="h-4 w-4" />
          Add another item
        </Button>
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
                Save Outfit ({filledCount} items)
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
