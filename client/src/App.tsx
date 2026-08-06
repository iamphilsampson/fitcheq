import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
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

/**
 * Durable guard against a Radix modal freeze. Radix Dialog/AlertDialog set
 * `pointer-events: none` on <body> while open and remove it on close. If a
 * modal's page unmounts due to navigation (e.g. Delete → navigate) before that
 * close cleanup runs, the style sticks and freezes the entire app until a
 * force-restart. Clearing it on every route change makes that state impossible:
 * any navigation self-heals, for every page — including ones added later.
 */
function PointerEventsGuard() {
  const [location] = useLocation();
  useEffect(() => {
    document.body.style.pointerEvents = "";
  }, [location]);
  return null;
}

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
          <PointerEventsGuard />
          <EnvBanner />
          <Toaster />
          <Gate />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
