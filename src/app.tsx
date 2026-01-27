import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/hooks/use-toast";
import { HomePage } from "@/pages/home";
import { withAuthenticationRequired } from "@auth0/auth0-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useMatch } from "react-router";
import { AuthProvider } from "./components/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { useMe } from "./hooks/api";
import "./index.css";
import { NotFoundPage } from "./pages/404";
import { AddPage } from "./pages/add";
import { WelcomePage } from "./pages/welcome";

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
        <AuthProvider>
          <ForceWelcome>
            <Routes>
              <Route index Component={withAuthenticationRequired(HomePage)} />
              <Route path="/add" Component={withAuthenticationRequired(AddPage)} />
              <Route path="/welcome" Component={withAuthenticationRequired(WelcomePage)} />
              <Route path="*" Component={NotFoundPage} />
            </Routes>
          </ForceWelcome>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

/** Force the user to go through onboarding if they haven't already. */
function ForceWelcome({ children }: { children: React.ReactNode }) {
  const match = useMatch({ path: "/welcome" });
  const { data: me, isPending, error } = useMe();

  if (isPending) {
    return <LoaderCircleIcon className="h-16 w-16 animate-spin" />;
  }

  if (error) {
    return (
      <Alert variant={"destructive"}>
        <CircleAlertIcon className="h-4 w-4" />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!me.has_avatar_image && !match) {
    return <Navigate to="/welcome" />;
  }

  return children;
}
