import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/hooks/use-toast";
import { HomePage } from "@/pages/home";
import { withAuthenticationRequired } from "@auth0/auth0-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./components/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { useHealth } from "./hooks/api";
import "./index.css";
import { NotFoundPage } from "./pages/404";
import { AddPage } from "./pages/add";

const queryClient = new QueryClient();

export function App() {
  useEffect(() => {
    queryClient.setDefaultOptions({
      mutations: {
        onError: (error) => {
          console.error(error);
          toast({
            title: "Oops, something went wrong!",
            description: `Computer says: '${error.message}'`,
            variant: "destructive",
          });
        },
      },
    });
  }, []);

  // Show an informational toast in production to indicate alpha status (once per session)
  useEffect(() => {
    if (import.meta.env.PROD) {
      const storageKey = "alpha_notice_shown";
      const hasShown = sessionStorage.getItem(storageKey) === "true";
      if (!hasShown) {
        alert(
          "This is an alpha version of dressme. Expect your data to vanish with no notice. Have fun!",
        );
        sessionStorage.setItem(storageKey, "true");
      }
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ApiWarmupGate>
          <AuthProvider>
            <Routes>
              <Route index Component={withAuthenticationRequired(HomePage)} />
              <Route path="/add" Component={withAuthenticationRequired(AddPage)} />
              <Route path="*" Component={NotFoundPage} />
            </Routes>
          </AuthProvider>
        </ApiWarmupGate>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

/** Blocks UI until the backend responds to a simple health check. */
function ApiWarmupGate({ children }: { children: React.ReactNode }) {
  const { isPending, error } = useHealth();

  if (isPending || error) {
    return (
      // Use delayed appear to prevent flashing this alert on every page load
      <div className="animate-delayed-appear flex h-screen items-center justify-center px-6">
        <div className="w-full max-w-xl">
          <Alert>
            <LoaderCircleIcon className="h-4 w-4 animate-spin" />
            <AlertTitle>We're getting ready! 💅</AlertTitle>
            <AlertDescription>
              Our backend is getting its things in order (probably restarting). Should be ready to
              go in just a minute...
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return children;
}
