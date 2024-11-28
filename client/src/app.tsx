import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home } from "./home";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>
  );
}
