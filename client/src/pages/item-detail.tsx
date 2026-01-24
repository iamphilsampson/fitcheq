import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Shirt, Calendar, Trash2, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
          <Skeleton className="aspect-square rounded-lg" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </main>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shirt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  data-testid="button-delete"
                >
                  <Trash2 className="h-5 w-5" />
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
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        <Card className="overflow-hidden">
          <div className="aspect-square bg-muted">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.description || item.category}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Shirt className="h-16 w-16 text-muted-foreground" />
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {item.subCategory || item.category}
            </h2>
            {item.brand && (
              <p className="text-muted-foreground">{item.brand}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{item.category}</Badge>
            {item.color && (
              <Badge variant="outline" className="gap-1.5">
                <span
                  className="w-3 h-3 rounded-full border"
                  style={{ backgroundColor: item.color.toLowerCase() }}
                />
                {item.color}
              </Badge>
            )}
            {item.size && <Badge variant="outline">Size: {item.size}</Badge>}
          </div>

          {item.description && (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">
              Worn in {item.outfits?.length || 0} outfits
            </h3>
          </div>

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
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
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
