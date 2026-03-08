import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Camera, Shirt, Calendar, LayoutGrid, List, Settings, Plus, X, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Item, Outfit } from "@shared/schema";

type OutfitWithCount = Outfit & { itemCount: number };

function getPreset(): "male" | "female" {
  return (localStorage.getItem("fitcheck-preset") as "male" | "female") || "male";
}

const PRESETS: Record<string, { subCategories: string[] }[]> = {
  male: [
    { subCategories: ["T-Shirt", "Long Sleeve", "Shirt (Short)", "Shirt (Long)", "Vest", "Jumper", "Hoodie"] },
  ],
  female: [
    { subCategories: ["T-Shirt", "Blouse", "Crop Top", "Tank Top", "Sweater", "Hoodie", "Cami"] },
  ],
};

interface BulkEntry {
  id: string;
  subCategory: string;
  colorBrand: string;
}

export default function Home() {
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const initialTab = searchParams.get("tab") === "wardrobe" ? "wardrobe" : "outfits";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [outfitViewMode, setOutfitViewMode] = useState<"card" | "feed">("card");
  const [showSettings, setShowSettings] = useState(false);
  const [preset, setPreset] = useState<"male" | "female">(getPreset);
  const [bulkAddCategory, setBulkAddCategory] = useState<string | null>(null);
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([]);
  const { toast } = useToast();

  const handlePresetChange = (value: "male" | "female") => {
    setPreset(value);
    localStorage.setItem("fitcheck-preset", value);
  };

  const { data: items, isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ["/api/items"],
  });

  const { data: outfits, isLoading: outfitsLoading } = useQuery<OutfitWithCount[]>({
    queryKey: ["/api/outfits"],
  });

  const groupedItems = items?.reduce(
    (acc, item) => {
      const category = item.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, Item[]>
  );

  const startBulkAdd = (category: string) => {
    setBulkAddCategory(category);
    setBulkEntries([{ id: crypto.randomUUID(), subCategory: "", colorBrand: "" }]);
  };

  const addBulkRow = () => {
    setBulkEntries((prev) => [...prev, { id: crypto.randomUUID(), subCategory: "", colorBrand: "" }]);
  };

  const updateBulkEntry = (id: string, field: "subCategory" | "colorBrand", value: string) => {
    setBulkEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const removeBulkEntry = (id: string) => {
    setBulkEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const saveBulkItems = async () => {
    if (!bulkAddCategory) return;
    const valid = bulkEntries.filter((e) => e.subCategory.trim());
    if (valid.length === 0) {
      setBulkAddCategory(null);
      return;
    }

    setIsSavingBulk(true);
    try {
      for (const entry of valid) {
        const parts = entry.colorBrand.split("/").map((s) => s.trim());
        const color = parts[0] || null;
        const brand = parts[1] || null;
        const desc = [color, entry.subCategory].filter(Boolean).join(" ");
        await apiRequest("POST", "/api/items", {
          category: bulkAddCategory,
          subCategory: entry.subCategory.trim(),
          color,
          brand,
          description: desc || null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: `${valid.length} item${valid.length !== 1 ? "s" : ""} added` });
      setBulkAddCategory(null);
      setBulkEntries([]);
    } catch (error) {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSavingBulk(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            data-testid="button-settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold tracking-tight text-foreground" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "-0.03em" }}>
            fit<span className="text-primary">check</span>
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="pb-24">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="outfits" data-testid="tab-outfits">
              <Calendar className="h-4 w-4 mr-2" />
              Outfits
            </TabsTrigger>
            <TabsTrigger value="wardrobe" data-testid="tab-wardrobe">
              <Shirt className="h-4 w-4 mr-2" />
              Wardrobe
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outfits" className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                {outfits?.length || 0} outfits
              </span>
              <div className="flex gap-1">
                <Button
                  variant={outfitViewMode === "card" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setOutfitViewMode("card")}
                  data-testid="button-card-view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={outfitViewMode === "feed" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setOutfitViewMode("feed")}
                  data-testid="button-feed-view"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {outfitsLoading ? (
              <div className={outfitViewMode === "card" ? "grid grid-cols-2 gap-3" : "space-y-4"}>
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-md" />
                ))}
              </div>
            ) : !outfits?.length ? (
              <EmptyState
                icon={<Calendar className="h-12 w-12" />}
                title="No outfits yet"
                description="Capture your first outfit to start tracking your style"
              />
            ) : outfitViewMode === "card" ? (
              <div className="grid grid-cols-2 gap-3">
                {outfits.map((outfit) => (
                  <Link key={outfit.id} href={`/outfits/${outfit.id}`}>
                    <Card
                      className="overflow-hidden hover-elevate cursor-pointer"
                      data-testid={`card-outfit-${outfit.id}`}
                    >
                      <div className="aspect-[3/4] bg-muted">
                        <img
                          src={outfit.fullImageUrl}
                          alt={`Outfit from ${outfit.dateWorn}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium">
                            {new Date(outfit.dateWorn).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          {outfit.itemCount > 0 && (
                            <span className="text-xs text-muted-foreground" data-testid={`text-item-count-${outfit.id}`}>
                              {outfit.itemCount} item{outfit.itemCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        {outfit.notes && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {outfit.notes}
                          </p>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {outfits.map((outfit) => (
                  <Link key={outfit.id} href={`/outfits/${outfit.id}`}>
                    <Card
                      className="overflow-hidden hover-elevate cursor-pointer"
                      data-testid={`card-outfit-feed-${outfit.id}`}
                    >
                      <div className="bg-muted">
                        <img
                          src={outfit.fullImageUrl}
                          alt={`Outfit from ${outfit.dateWorn}`}
                          className="w-full object-cover"
                          style={{ maxHeight: "70vh" }}
                        />
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            {new Date(outfit.dateWorn).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          {outfit.itemCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {outfit.itemCount} item{outfit.itemCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        {outfit.notes && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {outfit.notes}
                          </p>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="wardrobe" className="mt-4">
            {itemsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            ) : !items?.length ? (
              <EmptyState
                icon={<Shirt className="h-12 w-12" />}
                title="No items yet"
                description="Add your first outfit to start building your wardrobe"
              />
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedItems || {}).map(([category, categoryItems]) => (
                  <div key={category}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</h2>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {categoryItems.length}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground"
                          onClick={() => startBulkAdd(category)}
                          data-testid={`button-add-${category.toLowerCase()}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {bulkAddCategory === category && (
                      <div className="mb-2 p-3 rounded-lg border bg-card space-y-2" data-testid="bulk-add-panel">
                        {bulkEntries.map((entry, idx) => (
                          <div key={entry.id} className="flex items-center gap-2">
                            <Input
                              placeholder="Type (e.g. T-Shirt)"
                              value={entry.subCategory}
                              onChange={(e) => updateBulkEntry(entry.id, "subCategory", e.target.value)}
                              className="text-sm flex-1"
                              autoFocus={idx === bulkEntries.length - 1}
                              data-testid={`bulk-subcategory-${idx}`}
                            />
                            <Input
                              placeholder="Colour / Brand"
                              value={entry.colorBrand}
                              onChange={(e) => updateBulkEntry(entry.id, "colorBrand", e.target.value)}
                              className="text-sm flex-1"
                              data-testid={`bulk-colorbrand-${idx}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeBulkEntry(entry.id)}
                              className="flex-shrink-0 text-muted-foreground"
                              data-testid={`bulk-remove-${idx}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs text-muted-foreground"
                            onClick={addBulkRow}
                            data-testid="button-bulk-add-row"
                          >
                            <Plus className="h-3 w-3" />
                            Add row
                          </Button>
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => { setBulkAddCategory(null); setBulkEntries([]); }}
                            data-testid="button-bulk-cancel"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="text-xs gap-1"
                            onClick={saveBulkItems}
                            disabled={isSavingBulk}
                            data-testid="button-bulk-save"
                          >
                            {isSavingBulk ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            Save
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-0">
                      {categoryItems.map((item) => (
                        <Link key={item.id} href={`/items/${item.id}`}>
                          <div
                            className="flex items-center gap-2 py-2 px-1 rounded hover-elevate cursor-pointer"
                            data-testid={`item-row-${item.id}`}
                          >
                            {item.color && (
                              <span
                                className="w-2.5 h-2.5 rounded-full border flex-shrink-0"
                                style={{ backgroundColor: item.color.toLowerCase() }}
                              />
                            )}
                            <span className="text-sm font-medium truncate">
                              {item.subCategory || item.category}
                            </span>
                            {item.brand && (
                              <span className="text-xs text-muted-foreground truncate">
                                {item.brand}
                              </span>
                            )}
                            {item.color && !item.brand && (
                              <span className="text-xs text-muted-foreground truncate">
                                {item.color}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
        <Link href="/add-outfit">
          <Button size="lg" className="rounded-full shadow-lg gap-2" data-testid="button-add-outfit">
            <Camera className="h-5 w-5" />
            Add Outfit
          </Button>
        </Link>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Choose your clothing preset</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Clothing preset</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={preset === "male" ? "default" : "outline"}
                className="w-full"
                onClick={() => handlePresetChange("male")}
                data-testid="button-preset-male"
              >
                Male
              </Button>
              <Button
                variant={preset === "female" ? "default" : "outline"}
                className="w-full"
                onClick={() => handlePresetChange("female")}
                data-testid="button-preset-female"
              >
                Female
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-muted-foreground mb-4">{icon}</div>
      <h3 className="font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[200px]">{description}</p>
    </div>
  );
}
