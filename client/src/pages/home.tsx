import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Camera, Shirt, Calendar, Search, Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, Outfit } from "@shared/schema";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("wardrobe");

  const { data: items, isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ["/api/items"],
  });

  const { data: outfits, isLoading: outfitsLoading } = useQuery<Outfit[]>({
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
        <div className="px-4 py-3">
          <h1 className="text-2xl font-bold text-foreground">Fit Check</h1>
          <p className="text-sm text-muted-foreground">Your digital wardrobe</p>
        </div>
      </header>

      <main className="pb-24">
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search your wardrobe..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wardrobe" data-testid="tab-wardrobe">
              <Shirt className="h-4 w-4 mr-2" />
              Wardrobe
            </TabsTrigger>
            <TabsTrigger value="outfits" data-testid="tab-outfits">
              <Calendar className="h-4 w-4 mr-2" />
              Outfits
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="outfits" className="mt-4">
            {outfitsLoading ? (
              <div className="grid grid-cols-2 gap-3">
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
            ) : (
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
                        <p className="text-xs font-medium">
                          {new Date(outfit.dateWorn).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
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
