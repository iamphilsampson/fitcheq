import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import AddOutfit from "@/pages/add-outfit";
import Reconcile from "@/pages/reconcile";
import ItemDetail from "@/pages/item-detail";
import OutfitDetail from "@/pages/outfit-detail";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/add-outfit" component={AddOutfit} />
      <Route path="/reconcile/:outfitId" component={Reconcile} />
      <Route path="/items/:id" component={ItemDetail} />
      <Route path="/outfits/:id" component={OutfitDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="max-w-md mx-auto min-h-screen bg-background">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
