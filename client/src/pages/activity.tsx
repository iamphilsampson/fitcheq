import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Shirt, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityLogEntry } from "@shared/schema";

function formatTimestamp(ts: string | Date) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} at ${time}`;
}

export default function Activity() {
  const { data: log, isLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/activity"],
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="px-4 py-2 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-base font-semibold">Activity Log</h1>
        </div>
      </header>

      <main className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 items-start">
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : !log?.length ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No activity yet — actions will appear here as you add or delete outfits and items.
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-0">
              {log.map((entry) => {
                const isCreated = entry.action === "created";
                const isOutfit = entry.entityType === "outfit";
                return (
                  <div key={entry.id} className="flex gap-4 items-start pb-5 relative">
                    <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                      isCreated
                        ? "bg-background border-green-500 text-green-600"
                        : "bg-background border-destructive text-destructive"
                    }`}>
                      {isCreated
                        ? <Plus className="h-3.5 w-3.5" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 pt-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${isCreated ? "text-green-600" : "text-destructive"}`}>
                          {isCreated ? "Added" : "Deleted"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {isOutfit ? <Calendar className="inline h-3 w-3 mr-0.5" /> : <Shirt className="inline h-3 w-3 mr-0.5" />}
                          {isOutfit ? "outfit" : "item"}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground mt-0.5 truncate">{entry.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatTimestamp(entry.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
