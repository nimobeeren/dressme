import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Toaster } from "./components/ui/toaster";
import { Home } from "./home";
import { useToast } from "./hooks/use-toast";

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
    <HelmetProvider>
      <Helmet>
        <base href={import.meta.env.VITE_API_BASE_URL} />
      </Helmet>
      <QueryClientProvider client={queryClient}>
        <Home />
        <Toaster />
      </QueryClientProvider>
    </HelmetProvider>
  );
}
