import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Camera, Shirt, Calendar, Search, LayoutGrid, List, Settings } from "lucide-react";
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
import type { Item, Outfit } from "@shared/schema";

type OutfitWithCount = Outfit & { itemCount: number };

function getPreset(): "male" | "female" {
  return (localStorage.getItem("fitcheck-preset") as "male" | "female") || "male";
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("outfits");
  const [outfitViewMode, setOutfitViewMode] = useState<"card" | "feed">("card");
  const [showSettings, setShowSettings] = useState(false);
  const [preset, setPreset] = useState<"male" | "female">(getPreset);

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

  const filteredItems = items?.filter(
    (item) =>
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subCategory?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.color?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedItems = filteredItems?.reduce(
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight text-foreground" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "-0.03em" }}>
            fit<span className="text-primary">check</span>
          </h1>
          <div className="flex items-center gap-2 flex-1 justify-end ml-3">
            <div className="relative flex-1 max-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="pl-8 h-8 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
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
                    <Skeleton className="h-6 w-24" />
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((j) => (
                        <Skeleton key={j} className="aspect-square rounded-md" />
                      ))}
                    </div>
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
              <div className="space-y-6">
                {Object.entries(groupedItems || {}).map(([category, categoryItems]) => (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="font-semibold text-foreground">{category}</h2>
                      <span className="text-sm text-muted-foreground">
                        {categoryItems.length} items
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {categoryItems.map((item) => (
                        <Link key={item.id} href={`/items/${item.id}`}>
                          <Card
                            className="overflow-hidden hover-elevate cursor-pointer"
                            data-testid={`card-item-${item.id}`}
                          >
                            <div className="aspect-square bg-muted relative">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.description || item.category}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Shirt className="h-8 w-8 text-muted-foreground" />
                                </div>
                              )}
                              {item.color && (
                                <div
                                  className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm"
                                  style={{ backgroundColor: item.color.toLowerCase() }}
                                />
                              )}
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-medium truncate">
                                {item.subCategory || item.category}
                              </p>
                              {item.brand && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {item.brand}
                                </p>
                              )}
                            </div>
                          </Card>
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
