"use client";

import { AuthProvider } from "@/components/auth-provider";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/hooks/use-toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  // Auth0Provider accesses window during initialisation and must never run
  // during SSR. Through a useEffect we guarantee it renders only on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
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
      {mounted ? <AuthProvider>{children}</AuthProvider> : children}
      <Toaster />
    </QueryClientProvider>
  );
}
