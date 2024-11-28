import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Home } from "./home";

const queryClient = new QueryClient();

export function App() {
  return (
    <HelmetProvider>
      <Helmet>
        <base href={import.meta.env.VITE_API_BASE_URL} />
      </Helmet>
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>
    </HelmetProvider>
  );
}
