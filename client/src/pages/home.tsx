import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Camera, Shirt, Calendar, LayoutGrid, List, Settings, Plus, X, Loader2, Check, ChevronDown, ChevronRight, LogIn, LogOut, User, ArrowDownWideNarrow } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { Item, Outfit } from "@shared/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type OutfitWithCount = Outfit & { itemCount: number };
type ItemWithWearCount = Item & { wearCount: number };

function getPreset(): "male" | "female" {
  return (localStorage.getItem("fitcheck-preset") as "male" | "female") || "male";
}

const ALL_CATEGORIES: Record<"male" | "female", Record<string, string[]>> = {
  male: {
    Tops: ["T-Shirt", "Long Sleeve", "Shirt (Short)", "Shirt (Long)", "Vest", "Jumper", "Hoodie"],
    Outerwear: ["Coat", "Jacket", "Overshirt", "Windbreaker"],
    Bottoms: ["Jeans", "Trousers", "Shorts"],
    Footwear: ["Wallabee", "Trainers"],
    Accessories: ["Hat", "Bag", "Belt", "Sunnies"],
  },
  female: {
    Tops: ["T-Shirt", "Blouse", "Crop Top", "Tank Top", "Sweater", "Hoodie", "Cami"],
    Outerwear: ["Jacket", "Coat", "Blazer", "Cardigan", "Trench"],
    Bottoms: ["Jeans", "Trousers", "Skirt", "Shorts", "Leggings"],
    Footwear: ["Sneakers", "Boots", "Heels", "Sandals", "Flats", "Loafers"],
    Accessories: ["Bag", "Belt", "Sunglasses", "Jewelry", "Scarf", "Hat"],
  },
};

function getSubCategoryOptions(category: string, preset: "male" | "female", existingItems: Item[]): string[] {
  const presetSubs = ALL_CATEGORIES[preset]?.[category] ?? [];
  const existingSubs = existingItems
    .filter((i) => i.category === category && i.subCategory)
    .map((i) => i.subCategory!);
  return [...new Set([...presetSubs, ...existingSubs])];
}

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
  // Persist wardrobe expand + scroll across navigation (sessionStorage) so returning
  // from an item/outfit lands you where you were, not on a collapsed, top-of-page list.
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem("fitcheck-wardrobe-expanded");
      return saved ? new Set<string>(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [wardrobeSort, setWardrobeSort] = useState<"recent" | "wears">("wears");
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // When user signs in: show draft banner if a guest draft exists
  // (orphan claim is now handled server-side in the auth callback)
  useEffect(() => {
    if (isAuthenticated) {
      const draft = localStorage.getItem("fitcheck-outfit-draft");
      if (draft) {
        setShowDraftBanner(true);
      }
    }
  }, [isAuthenticated]);

  const handlePresetChange = (value: "male" | "female") => {
    setPreset(value);
    localStorage.setItem("fitcheck-preset", value);
  };

  const { data: items, isLoading: itemsLoading } = useQuery<ItemWithWearCount[]>({
    queryKey: ["/api/items"],
    enabled: isAuthenticated && !authLoading,
  });

  const { data: outfits, isLoading: outfitsLoading } = useQuery<OutfitWithCount[]>({
    queryKey: ["/api/outfits"],
    enabled: isAuthenticated && !authLoading,
  });

  // Persist expanded categories whenever they change.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "fitcheck-wardrobe-expanded",
        JSON.stringify([...expandedCategories]),
      );
    } catch {}
  }, [expandedCategories]);

  // Scroll target captured ONCE at mount, before any save can overwrite it.
  const scrollTarget = useRef<number>(
    (() => {
      try {
        const s = sessionStorage.getItem("fitcheck-wardrobe-scroll");
        const y = s ? parseInt(s, 10) : 0;
        return Number.isFinite(y) ? y : 0;
      } catch {
        return 0;
      }
    })(),
  );
  // Gate saving until the restore has settled, so an early scroll event can't
  // clobber the saved position with 0 before we restore it.
  const scrollReady = useRef(false);

  // Take scroll restoration off "auto" so the browser doesn't reset us to 0.
  useEffect(() => {
    const prev = history.scrollRestoration;
    try {
      history.scrollRestoration = "manual";
    } catch {}
    return () => {
      try {
        history.scrollRestoration = prev;
      } catch {}
    };
  }, []);

  // Restore wardrobe scroll once the list is rendered, retrying across a few
  // frames because the expanded rows keep growing the page height after mount.
  useEffect(() => {
    if (scrollReady.current || activeTab !== "wardrobe" || itemsLoading) return;
    const target = scrollTarget.current;
    if (target <= 0) {
      scrollReady.current = true;
      return;
    }
    let attempts = 0;
    const tryScroll = () => {
      window.scrollTo(0, target);
      attempts += 1;
      if (Math.abs(window.scrollY - target) <= 2 || attempts >= 20) {
        scrollReady.current = true;
        return;
      }
      requestAnimationFrame(tryScroll);
    };
    requestAnimationFrame(tryScroll);
  }, [activeTab, itemsLoading]);

  // Save wardrobe scroll position (rAF-throttled), once restore has settled.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (!scrollReady.current || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (activeTab === "wardrobe") {
          try {
            sessionStorage.setItem("fitcheck-wardrobe-scroll", String(window.scrollY));
          } catch {}
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [activeTab]);

  const groupedItems = items?.reduce(
    (acc, item) => {
      const category = item.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, ItemWithWearCount[]>
  );

  // When sorting by wears, reorder items within each category (most-worn first);
  // "recent" keeps the server's createdAt-desc order.
  if (groupedItems && wardrobeSort === "wears") {
    for (const category of Object.keys(groupedItems)) {
      groupedItems[category].sort((a, b) => b.wearCount - a.wearCount);
    }
  }

  const startBulkAdd = (category: string) => {
    setBulkAddCategory(category);
    setBulkEntries([{ id: crypto.randomUUID(), subCategory: "", colorBrand: "" }]);
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.add(category);
      return next;
    });
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
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center justify-between">
          {/* Spacer keeps the title centred when the right element exists */}
          <div className="w-9 flex-shrink-0" />
          <h1 className="text-lg font-bold tracking-tight text-foreground flex-1 text-center" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "-0.03em" }}>
            fit<span className="text-primary">check</span>
          </h1>
          <div className="w-9 flex-shrink-0 flex justify-end">
            {authLoading ? (
              <div className="w-9 h-9 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    data-testid="button-user-menu"
                    className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                  >
                    <Avatar className="h-9 w-9">
                      {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt={user.firstName ?? "User"} />}
                      <AvatarFallback className="text-xs">
                        {user.firstName?.[0]?.toUpperCase() ?? <User className="h-3 w-3" />}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setShowSettings(true)} data-testid="menu-settings">
                    <Settings className="h-4 w-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()} data-testid="menu-sign-out">
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { window.location.reload(); }}
                data-testid="button-sign-in"
              >
                <LogIn className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="pb-24">
        {/* Draft restore banner */}
        {showDraftBanner && (
          <div className="mx-4 mt-3 mb-0 p-3 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between gap-3" data-testid="banner-draft-restore">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">You have an unsaved outfit draft</p>
              <p className="text-xs text-muted-foreground">Continue from where you left off</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Link href="/add-outfit">
                <Button size="sm" variant="outline" data-testid="button-restore-draft" onClick={() => {}}>
                  Continue
                </Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                data-testid="button-dismiss-draft"
                onClick={() => {
                  localStorage.removeItem("fitcheck-outfit-draft");
                  setShowDraftBanner(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

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
                      <div className="bg-muted aspect-[3/4] overflow-hidden">
                        <img
                          src={outfit.fullImageUrl}
                          alt={`Outfit from ${outfit.dateWorn}`}
                          className="w-full h-full object-cover block"
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
                      <div className="bg-muted overflow-hidden" style={{ maxHeight: "480px" }}>
                        <img
                          src={outfit.fullImageUrl}
                          alt={`Outfit from ${outfit.dateWorn}`}
                          className="w-full h-full object-cover block"
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
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{items.length} items</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground h-7 px-2 gap-1"
                      onClick={() => setWardrobeSort((s) => (s === "recent" ? "wears" : "recent"))}
                      data-testid="button-wardrobe-sort"
                    >
                      <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                      {wardrobeSort === "wears" ? "Most worn" : "Recent"}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-7 px-2"
                    onClick={() => {
                      const allCats = Object.keys(groupedItems || {});
                      const allExpanded = allCats.every((c) => expandedCategories.has(c));
                      setExpandedCategories(allExpanded ? new Set() : new Set(allCats));
                    }}
                    data-testid="button-toggle-all"
                  >
                    {Object.keys(groupedItems || {}).every((c) => expandedCategories.has(c))
                      ? "Collapse all"
                      : "Expand all"}
                  </Button>
                </div>

                <div className="divide-y">
                  {Object.entries(groupedItems || {}).map(([category, categoryItems]) => {
                    const isExpanded = expandedCategories.has(category);
                    const subCategoryOptions = getSubCategoryOptions(category, preset, items || []);
                    return (
                      <div key={category}>
                        <button
                          className="w-full flex items-center gap-2 py-2.5 text-left"
                          onClick={() =>
                            setExpandedCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(category)) next.delete(category);
                              else next.add(category);
                              return next;
                            })
                          }
                          data-testid={`button-toggle-${category.toLowerCase()}`}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                            {category}
                          </span>
                          <span className="text-xs text-muted-foreground">{categoryItems.length}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground ml-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              startBulkAdd(category);
                            }}
                            data-testid={`button-add-${category.toLowerCase()}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </button>

                        {isExpanded && (
                          <>
                            {bulkAddCategory === category && (
                              <div className="mb-2 p-3 rounded-lg border bg-card space-y-2" data-testid="bulk-add-panel">
                                {bulkEntries.map((entry, idx) => (
                                  <div key={entry.id} className="flex items-center gap-2">
                                    {subCategoryOptions.length > 0 ? (
                                      <Select
                                        value={entry.subCategory}
                                        onValueChange={(v) => updateBulkEntry(entry.id, "subCategory", v)}
                                      >
                                        <SelectTrigger
                                          className="text-sm flex-1"
                                          data-testid={`bulk-subcategory-${idx}`}
                                        >
                                          <SelectValue placeholder="Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {subCategoryOptions.map((sub) => (
                                            <SelectItem key={sub} value={sub}>
                                              {sub}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <Input
                                        placeholder="Type"
                                        value={entry.subCategory}
                                        onChange={(e) => updateBulkEntry(entry.id, "subCategory", e.target.value)}
                                        className="text-sm flex-1"
                                        autoFocus={idx === bulkEntries.length - 1}
                                        data-testid={`bulk-subcategory-${idx}`}
                                      />
                                    )}
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
                                    {isSavingBulk ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    Save
                                  </Button>
                                </div>
                              </div>
                            )}

                            <div className="space-y-0 pb-1">
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
                                    <span
                                      className={`ml-auto flex-shrink-0 text-xs tabular-nums ${
                                        item.wearCount > 0 ? "text-muted-foreground" : "text-muted-foreground/40"
                                      }`}
                                      title={`Worn ${item.wearCount} time${item.wearCount !== 1 ? "s" : ""}`}
                                      data-testid={`text-wear-count-${item.id}`}
                                    >
                                      {item.wearCount}×
                                    </span>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
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
          <div className="space-y-4">
            <div className="space-y-2">
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
            <div className="border-t pt-3">
              <Link href="/activity" onClick={() => setShowSettings(false)}>
                <Button variant="ghost" className="w-full justify-start text-sm text-muted-foreground" data-testid="button-activity-log">
                  Activity Log
                </Button>
              </Link>
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
