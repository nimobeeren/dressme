import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { HomePage } from "@/pages/home";
import { withAuthenticationRequired } from "@auth0/auth0-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./components/auth-provider";
import "./index.css";
import { NotFoundPage } from "./pages/404";
import { AddPage } from "./pages/add";
import { WelcomePage } from "./pages/welcome";

const queryClient = new QueryClient();

function App() {
  const { toast } = useToast();

  useMemo(() => {
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
  }, [toast]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route index Component={withAuthenticationRequired(HomePage)} />
            <Route path="/add" Component={withAuthenticationRequired(AddPage)} />
            <Route path="/welcome" Component={withAuthenticationRequired(WelcomePage)} />
            <Route path="*" Component={NotFoundPage} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
