import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, Plus, Loader2, Shirt, X, ChevronDown, ChevronUp, Footprints, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { getColorSwatch } from "@/lib/colorMap";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Item, DetectedItem, Outfit } from "@shared/schema";

function JacketIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2L8 6v4l-4 2v8h6v-4h4v4h6v-8l-4-2V6l-4-4z" />
      <path d="M12 2v8" />
    </svg>
  );
}

function TrousersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 2h12v6l-2 14h-3L12 12l-1 10H8L6 8V2z" />
    </svg>
  );
}

function SunglassesIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12c0-2 1.5-4 4-4h1.5L9 8h6l1.5 0H18c2.5 0 4 2 4 4" />
      <circle cx="7" cy="13" r="3" />
      <circle cx="17" cy="13" r="3" />
      <path d="M10 13h4" />
    </svg>
  );
}

const SLOT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Tops: Shirt,
  Outerwear: JacketIcon,
  Bottoms: TrousersIcon,
  Footwear: Footprints,
  Accessories: SunglassesIcon,
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

function SearchInput({
  slot,
  index,
  existingItems,
  slots,
  onSelectExisting,
  onUpdateColorBrand,
}: {
  slot: SlotState;
  index: number;
  existingItems: Item[] | undefined;
  slots: SlotState[];
  onSelectExisting: (slotId: string, item: Item) => void;
  onUpdateColorBrand: (slotId: string, value: string) => void;
}) {
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const usedIds = new Set(slots.filter((s) => s.existingItemId).map((s) => s.existingItemId));
  const query = slot.colorBrand.toLowerCase().trim();
  const matching = (existingItems || []).filter((item) => {
    if (usedIds.has(item.id)) return false;
    if (item.category.toLowerCase() !== slot.category.toLowerCase()) return false;
    if (slot.selectedSubCategory && item.subCategory && item.subCategory.toLowerCase() !== slot.selectedSubCategory.toLowerCase()) return false;
    if (!query) return true;
    const itemText = [item.color, item.brand, item.subCategory, item.description].filter(Boolean).join(" ").toLowerCase();
    return itemText.includes(query);
  }).slice(0, 6);

  const showDropdown = isFocused && matching.length > 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val.includes("/") && val.endsWith(" ") && val.trim().length > 0) {
      onUpdateColorBrand(slot.id, val.trimEnd() + " / ");
    } else {
      onUpdateColorBrand(slot.id, val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((prev) => Math.min(prev + 1, matching.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && focusedIdx >= 0 && focusedIdx < matching.length) {
      e.preventDefault();
      onSelectExisting(slot.id, matching[focusedIdx]);
      setIsFocused(false);
    }
  };

  useEffect(() => {
    setFocusedIdx(-1);
  }, [slot.colorBrand]);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        placeholder="Colour / Brand (e.g. Black / Nike)"
        value={slot.colorBrand}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        onKeyDown={handleKeyDown}
        className="text-sm"
        data-testid={`input-color-brand-${index}`}
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-md z-20 max-h-48 overflow-y-auto" data-testid={`dropdown-${index}`}>
          {matching.map((item, i) => (
            <button
              key={item.id}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                i === focusedIdx ? "bg-accent text-accent-foreground" : "hover-elevate"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectExisting(slot.id, item);
                setIsFocused(false);
              }}
              data-testid={`suggestion-${item.id}-slot-${index}`}
            >
              {(() => {
                const swatch = getColorSwatch(item.color);
                if (swatch.kind === "solid") {
                  return (
                    <div
                      className="w-6 h-6 rounded flex-shrink-0"
                      style={{
                        backgroundColor: swatch.hex,
                        border: swatch.needsBorder ? "1px solid hsl(var(--border))" : undefined,
                      }}
                    />
                  );
                }
                if (swatch.kind === "pattern") {
                  const bg =
                    swatch.pattern === "stripes"
                      ? "repeating-linear-gradient(45deg, #888 0px, #888 2px, #ccc 2px, #ccc 6px)"
                      : "conic-gradient(#888 90deg, #ccc 90deg 180deg, #888 180deg 270deg, #ccc 270deg)";
                  return (
                    <div
                      className="w-6 h-6 rounded flex-shrink-0 border border-border/40"
                      style={{ backgroundImage: bg, backgroundSize: swatch.pattern === "stripes" ? undefined : "8px 8px" }}
                    />
                  );
                }
                return (
                  <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Shirt className="h-3 w-3 text-muted-foreground" />
                  </div>
                );
              })()}
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium">{item.subCategory || item.category}</span>
                {(item.color || item.brand) && (
                  <span className="text-xs text-muted-foreground ml-1.5">
                    {[item.color, item.brand].filter(Boolean).join(" / ")}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface OutfitWithItems extends Outfit {
  items: Item[];
}

export default function Reconcile() {
  const [, params] = useRoute("/reconcile/:outfitId");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const outfitId = params?.outfitId ? parseInt(params.outfitId) : null;
  const searchParams = new URLSearchParams(window.location.search);
  const detectedItemsParam = searchParams.get("items");

  const preset = getPreset();
  const [slots, setSlots] = useState<SlotState[]>(() => buildInitialSlots(preset));
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(
    () => new Set(slots.filter((s) => s.required).map((s) => s.id))
  );
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [hoveredDivider, setHoveredDivider] = useState<number | null>(null);
  const [loadedExisting, setLoadedExisting] = useState(false);
  const [initialItemIds, setInitialItemIds] = useState<Set<number>>(new Set());

  const toggleExpanded = (slotId: string) => {
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  const { data: outfit, isLoading: outfitLoading } = useQuery<OutfitWithItems>({
    queryKey: ["/api/outfits", outfitId],
    enabled: !!outfitId,
  });

  const { data: existingItems } = useQuery<Item[]>({
    queryKey: ["/api/items"],
  });

  useEffect(() => {
    if (!outfit || !outfit.items || loadedExisting) return;
    if (outfit.items.length === 0) {
      setLoadedExisting(true);
      return;
    }

    setSlots((prev) => {
      let updated = [...prev];
      const expanded = new Set(expandedSlots);
      const remainingItems = [...outfit.items];

      for (const item of [...remainingItems]) {
        const slotIdx = updated.findIndex(
          (s) =>
            s.category.toLowerCase() === item.category.toLowerCase() &&
            !s.existingItemId &&
            !s.selectedSubCategory
        );
        if (slotIdx >= 0) {
          updated[slotIdx] = {
            ...updated[slotIdx],
            existingItemId: item.id,
            selectedSubCategory: item.subCategory || item.category,
            colorBrand: [item.color, item.brand].filter(Boolean).join(" / "),
            skipped: false,
          };
          expanded.add(updated[slotIdx].id);
          remainingItems.splice(remainingItems.indexOf(item), 1);
        }
      }

      for (const item of remainingItems) {
        const presetSlot = PRESETS[preset].slots.find(
          (s) => s.category.toLowerCase() === item.category.toLowerCase()
        ) || PRESETS[preset].slots[0];
        const newSlot: SlotState = {
          id: makeSlotId(),
          category: presetSlot.category,
          label: presetSlot.label,
          required: false,
          subCategories: presetSlot.subCategories,
          selectedSubCategory: item.subCategory || item.category,
          colorBrand: [item.color, item.brand].filter(Boolean).join(" / "),
          existingItemId: item.id,
          skipped: false,
        };
        updated.push(newSlot);
        expanded.add(newSlot.id);
      }

      setExpandedSlots(expanded);
      return updated;
    });

    const loadedIds = new Set(outfit.items.map((i) => i.id));
    setInitialItemIds(loadedIds);
    setLoadedExisting(true);
  }, [outfit, loadedExisting, preset]);

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

      await apiRequest("PUT", `/api/outfits/${outfitId}/items`, { itemIds });
      return itemIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outfits"] });
      toast({ title: "Outfit saved!", description: "Items tagged to your outfit." });
      navigate(`/outfits/${outfitId}`);
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

  const selectExistingItem = useCallback((slotId: string, item: Item) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, existingItemId: item.id, selectedSubCategory: item.subCategory || item.category, colorBrand: [item.color, item.brand].filter(Boolean).join(" / "), skipped: false }
          : s
      )
    );
  }, []);

  const updateColorBrand = useCallback((slotId: string, colorBrand: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, colorBrand, existingItemId: null } : s))
    );
  }, []);

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

  const insertSlotAt = (position: number) => {
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
    setSlots((prev) => {
      const next = [...prev];
      next.splice(position, 0, newSlot);
      return next;
    });
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      next.add(newSlot.id);
      return next;
    });
  };

  const addExtraSlot = () => {
    insertSlotAt(slots.length);
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

  const filledCount = slots.filter((s) => !s.skipped && (s.selectedSubCategory || s.existingItemId)).length;
  const initialSlotCount = PRESETS[preset].slots.length;

  const hasChanges = () => {
    const currentIds = new Set(
      slots.filter((s) => !s.skipped && s.existingItemId).map((s) => s.existingItemId!)
    );
    const hasNewItems = slots.some((s) => !s.skipped && s.selectedSubCategory && !s.existingItemId);
    if (hasNewItems) return true;
    if (currentIds.size !== initialItemIds.size) return true;
    for (const id of currentIds) {
      if (!initialItemIds.has(id)) return true;
    }
    return false;
  };

  const handleBack = () => {
    if (hasChanges()) {
      setShowExitDialog(true);
    } else {
      navigate(`/outfits/${outfitId}`);
    }
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
        <div className="px-4 py-2 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
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

      <main className="p-4 pb-28 space-y-0">
        {outfit && (
          <Card
            className="overflow-hidden mb-3 cursor-pointer relative group"
            onClick={() => setImagePreviewOpen(true)}
            data-testid="card-outfit-preview"
          >
            <div className="bg-muted max-h-48 overflow-hidden flex items-center justify-center">
              <img
                src={outfit.fullImageUrl}
                alt="Outfit"
                className="w-full object-contain max-h-48"
              />
            </div>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" />
            </div>
          </Card>
        )}

        {slots.map((slot, index) => {
          const isExpanded = expandedSlots.has(slot.id);
          const isFilled = !!(slot.selectedSubCategory || slot.existingItemId);
          const isExtra = index >= initialSlotCount;
          const selectedExisting = existingItems?.find((i) => i.id === slot.existingItemId);

          return (
            <div key={slot.id}>
              {index > 0 && (
                <div
                  className="relative flex items-center justify-center py-1 group/divider cursor-pointer"
                  onMouseEnter={() => setHoveredDivider(index)}
                  onMouseLeave={() => setHoveredDivider(null)}
                  onClick={() => insertSlotAt(index)}
                  data-testid={`divider-insert-${index}`}
                >
                  <div className={`absolute inset-x-4 h-px transition-colors ${hoveredDivider === index ? "bg-primary" : "bg-transparent"}`} />
                  <div className={`relative z-10 flex items-center justify-center w-6 h-6 rounded-full border transition-all ${
                    hoveredDivider === index
                      ? "bg-primary border-primary text-primary-foreground scale-100 opacity-100"
                      : "bg-background border-transparent text-transparent scale-75 opacity-0"
                  }`}>
                    <Plus className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}

              {slot.skipped ? (
                <Card
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
              ) : (
                <Card className="p-3" data-testid={`card-slot-${index}`}>
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => toggleExpanded(slot.id)}
                  >
                    <SlotIcon category={slot.category} className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-sm font-medium">{slot.label}</span>
                      {isFilled && (
                        <Badge variant="secondary" className="text-xs truncate max-w-[120px]">
                          {slot.selectedSubCategory}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!slot.required && !isExtra && !isFilled && (
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
                      {isExtra && !isFilled && (
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

                      {!slot.selectedSubCategory && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Select type</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {slot.subCategories.map((sub) => (
                              <button
                                key={sub}
                                className="relative px-2.5 py-1.5 rounded-full text-xs font-medium bg-muted text-foreground hover-elevate"
                                onClick={() => selectSubCategory(slot.id, sub)}
                                data-testid={`chip-${sub.replace(/\s+/g, "-").toLowerCase()}-${index}`}
                              >
                                {sub}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {slot.selectedSubCategory && !slot.existingItemId && (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover-elevate"
                              onClick={() => clearSlot(slot.id)}
                              data-testid={`chip-selected-${index}`}
                            >
                              {slot.selectedSubCategory}
                              <X className="h-3 w-3 flex-shrink-0" />
                            </button>
                          </div>
                          <SearchInput
                            slot={slot}
                            index={index}
                            existingItems={existingItems}
                            slots={slots}
                            onSelectExisting={selectExistingItem}
                            onUpdateColorBrand={updateColorBrand}
                          />
                        </>
                      )}

                      {slot.existingItemId && selectedExisting && (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-primary text-primary-foreground hover-elevate"
                            onClick={() => clearSlot(slot.id)}
                            data-testid={`chip-existing-${index}`}
                          >
                            {[selectedExisting.color, selectedExisting.brand].filter(Boolean).join(" / ") || selectedExisting.subCategory || selectedExisting.category}
                            <X className="h-3 w-3 flex-shrink-0" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )}
            </div>
          );
        })}

        <div className="pt-1">
          <Button
            variant="ghost"
            className="w-full gap-2 text-muted-foreground"
            onClick={addExtraSlot}
            data-testid="button-add-slot"
          >
            <Plus className="h-4 w-4" />
            Add another item
          </Button>
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
                Save Outfit ({filledCount} items)
              </>
            )}
          </Button>
        </div>
      </div>

      <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none overflow-hidden flex items-center justify-center" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Outfit Preview</DialogTitle>
          {outfit && (
            <img
              src={outfit.fullImageUrl}
              alt="Outfit full preview"
              className="max-w-full max-h-[90vh] object-contain"
              data-testid="img-full-preview"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save tagged items?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {filledCount} item{filledCount !== 1 ? "s" : ""} tagged. Would you like to save before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigate(`/outfits/${outfitId}`)} data-testid="button-discard">
              Discard
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => saveMutation.mutate()}
              data-testid="button-save-exit"
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
