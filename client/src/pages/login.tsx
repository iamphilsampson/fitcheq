import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shirt } from "lucide-react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: (pw: string) => apiRequest("POST", "/api/login", { password: pw }),
    onSuccess: () => {
      setError(null);
      // Re-run the auth query so the app un-gates.
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (err: Error) => {
      setError(/401/.test(err.message) ? "Incorrect password" : "Something went wrong");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) loginMutation.mutate(password);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Shirt className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">FitCheq</h1>
        <p className="mt-1 mb-8 text-sm text-muted-foreground">Enter your password to continue</p>

        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="password"
            inputMode="text"
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            className="h-12 text-center text-base"
            data-testid="input-password"
          />
          {error && <p className="text-sm text-destructive" data-testid="text-login-error">{error}</p>}
          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={loginMutation.isPending || !password.trim()}
            data-testid="button-login"
          >
            {loginMutation.isPending ? "Checking…" : "Log in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
