import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { Home } from "@/pages/home";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { NotFound } from "./pages/404";
import { Add } from "./pages/add";
import { Login } from "./pages/login";
import { Profile } from "./pages/profile";
import { AuthProvider } from "./components/auth-provider";

const queryClient = new QueryClient();

export function App() {
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
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route index element={<Home />} />
            <Route path="/add" element={<Add />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
