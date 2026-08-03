import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { EnvBanner } from "@/components/EnvBanner";
import { isProduction } from "@/lib/env";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Home from "@/pages/home";
import AddOutfit from "@/pages/add-outfit";
import Reconcile from "@/pages/reconcile";
import ItemDetail from "@/pages/item-detail";
import OutfitDetail from "@/pages/outfit-detail";
import Activity from "@/pages/activity";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/add-outfit" component={AddOutfit} />
      <Route path="/reconcile/:outfitId" component={Reconcile} />
      <Route path="/items/:id" component={ItemDetail} />
      <Route path="/outfits/:id" component={OutfitDetail} />
      <Route path="/activity" component={Activity} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Gate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-dvh" aria-hidden />;
  }
  return isAuthenticated ? <Router /> : <Login />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className={`max-w-md mx-auto min-h-dvh bg-background ${isProduction ? "" : "has-env-banner"}`}>
          <EnvBanner />
          <Toaster />
          <Gate />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
