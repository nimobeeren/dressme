import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { Home } from "@/pages/home";
import { withAuthenticationRequired } from "@auth0/auth0-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./components/auth-provider";
import "./index.css";
import { NotFound } from "./pages/404";
import { Add } from "./pages/add";

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
            <Route index element={<ProtectedRoute component={Home} />} />
            <Route path="/add" element={<ProtectedRoute component={Add} />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

function ProtectedRoute({ component }: { component: React.ComponentType }) {
  const Component = withAuthenticationRequired(component);
  return <Component />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
